'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../models');
const { validatePassword } = require('../utils/passwordPolicy');

// Costo de bcrypt: cada +1 duplica el tiempo de cómputo del hash. 12 es
// el estándar recomendado actual (10 se quedó corto con el hardware de
// hoy) y sigue siendo rápido para un solo login (~250-300ms).
const BCRYPT_ROUNDS = 12;

function buildPayload(usuario, rol, extra = {}) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombre_completo: `${usuario.nombre} ${usuario.apellido}`.trim(),
    rol_id: usuario.rol_id,
    rol_codigo: rol ? rol.codigo : null,
    residencial_id: usuario.residencial_id,
    ...extra,
  };
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// --- Cookie de sesión (httpOnly) --------------------------------------
//
// El token también se sigue devolviendo en el cuerpo JSON de login y
// register (por compatibilidad con clientes que no son el navegador,
// como Postman o una futura app móvil, según documenta el README). Pero
// el frontend web incluido en public/ ya no lo guarda en localStorage:
// en vez de eso, cada request del navegador lo manda automáticamente
// vía esta cookie httpOnly, que JavaScript no puede leer ni un script
// inyectado por XSS puede robar.
const AUTH_COOKIE_NAME = 'vigia_token';

function cookieOptions(maxAgeMs) {
  const secure = process.env.COOKIE_SECURE === '1'
    || (process.env.COOKIE_SECURE !== '0' && process.env.NODE_ENV === 'production');
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

function setAuthCookie(res, token, expiresAt) {
  const maxAgeMs = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : undefined;
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions(maxAgeMs));
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions());
}

async function createSession(req, usuario, rol) {
  const jti = crypto.randomUUID();
  const payload = buildPayload(usuario, rol, { jti });
  const token = signToken(payload);
  const decoded = jwt.decode(token);
  const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await db.Sesiones.create({
    usuario_id: usuario.id,
    token_hash: tokenHash(token),
    dispositivo: String(req.headers['user-agent'] || 'Dispositivo desconocido').slice(0, 150),
    ip_origen: String(req.ip || '').slice(0, 45) || null,
    fecha_expiracion: expiresAt,
    activa: true,
  });
  return { token, usuario: payload, sesion_id: session.id, expira_en: expiresAt };
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'El correo y la contraseña son requeridos.' });
    }

    const usuario = await db.Usuarios.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!usuario || usuario.estado !== 'activo') {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const rol = await db.Roles.findByPk(usuario.rol_id);
    const sessionData = await createSession(req, usuario, rol);
    await usuario.update({ ultimo_acceso: new Date() });
    setAuthCookie(res, sessionData.token, sessionData.expira_en);
    res.json(sessionData);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/register
async function register(req, res, next) {
  const transaction = await db.sequelize.transaction();
  try {
    const { name, email, phone, unidad, colonia, password } = req.body || {};
    if (!name || !email || !phone || !unidad || !colonia || !password) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Completa todos los campos requeridos.' });
    }
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      await transaction.rollback();
      return res.status(400).json({ error: passwordCheck.error });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.Usuarios.findOne({ where: { email: normalizedEmail }, transaction });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo.' });
    }

    const rol = await db.Roles.findOne({ where: { codigo: 'residente' }, transaction });
    if (!rol) throw new Error('No existe el rol residente. Importa primero database/vigia_schema.sql.');

    const [residencial] = await db.Residenciales.findOrCreate({
      where: { nombre: String(colonia).trim() },
      defaults: {
        ciudad: 'La Ceiba',
        pais: 'Honduras',
        zona_horaria: 'America/Tegucigalpa',
        activo: true,
      },
      transaction,
    });

    await db.ConfiguracionesResidencial.findOrCreate({
      where: { residencial_id: residencial.id },
      defaults: { residencial_id: residencial.id, zona_horaria: residencial.zona_horaria || 'America/Tegucigalpa' },
      transaction,
    });

    const unitText = String(unidad).trim();
    let vivienda = await db.Viviendas.findOne({
      where: { residencial_id: residencial.id, numero: unitText },
      transaction,
    });
    if (!vivienda) {
      vivienda = await db.Viviendas.create({
        residencial_id: residencial.id,
        numero: unitText.slice(0, 20),
        tipo: 'vivienda',
        activo: true,
      }, { transaction });
    }

    const parts = String(name).trim().split(/\s+/);
    const nombre = parts.shift();
    const apellido = parts.join(' ') || nombre;
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const usuario = await db.Usuarios.create({
      residencial_id: residencial.id,
      rol_id: rol.id,
      nombre,
      apellido,
      email: normalizedEmail,
      telefono: String(phone).trim(),
      password_hash,
      estado: 'activo',
      debe_cambiar_clave: false,
    }, { transaction });

    await db.Residentes.create({
      usuario_id: usuario.id,
      vivienda_id: vivienda.id,
      tipo_residente: 'propietario',
      fecha_ingreso: new Date(),
    }, { transaction });

    await transaction.commit();
    const sessionData = await createSession(req, usuario, rol);
    setAuthCookie(res, sessionData.token, sessionData.expira_en);
    res.status(201).json(sessionData);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const usuario = await db.Usuarios.findByPk(req.user.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const rol = await db.Roles.findByPk(usuario.rol_id);
    res.json({ data: buildPayload(usuario, rol, { jti: req.user.jti }) });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.authToken) {
      await db.Sesiones.update(
        { activa: false },
        { where: { usuario_id: req.user.id, token_hash: tokenHash(req.authToken) } }
      );
    }
    clearAuthCookie(res);
    res.json({ mensaje: 'Sesion cerrada correctamente.' });
  } catch (err) { next(err); }
}

async function sessions(req, res, next) {
  try {
    const rows = await db.Sesiones.findAll({
      where: { usuario_id: req.user.id },
      attributes: ['id', 'dispositivo', 'ip_origen', 'fecha_inicio', 'fecha_expiracion', 'activa'],
      order: [['fecha_inicio', 'DESC']],
      limit: 20,
    });
    res.json({ data: rows });
  } catch (err) { next(err); }
}

async function revokeSession(req, res, next) {
  try {
    const row = await db.Sesiones.findOne({ where: { id: req.params.id, usuario_id: req.user.id } });
    if (!row) return res.status(404).json({ error: 'Sesion no encontrada.' });
    await row.update({ activa: false });
    res.json({ data: row, mensaje: 'Sesion revocada.' });
  } catch (err) { next(err); }
}

module.exports = { login, register, me, logout, sessions, revokeSession, tokenHash };
