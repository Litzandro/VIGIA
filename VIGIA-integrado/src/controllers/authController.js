'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../models');
const { validatePassword } = require('../utils/passwordPolicy');
const { enviarCorreo } = require('../services/envioService');
const { normalizarTelefonoHN } = require('../utils/telefonoHN');
const { sembrarTiposIncidenciaDefecto } = require('../utils/catalogoTiposIncidencia');

// Costo de bcrypt: cada +1 duplica el tiempo de cómputo del hash. 12 es
// el estándar recomendado actual (10 se quedó corto con el hardware de
// hoy) y sigue siendo rápido para un solo login (~250-300ms).
const BCRYPT_ROUNDS = 12;

// Deriva un nombre de cortesia a partir del correo cuando no hay nada
// mejor que mostrar (mismo criterio que el respaldo que ya existe en el
// frontend, public/js/dashboard.js -- se duplica aca a proposito: el
// saludo del dashboard no deberia depender de que el navegador arregle
// lo que el backend debio mandar completo desde un inicio).
function nombreDesdeCorreo(email) {
  if (!email) return 'Usuario';
  const local = String(email).split('@')[0] || 'usuario';
  const partes = local.split(/[.\-_]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1));
  return partes.join(' ') || 'Usuario';
}

function buildPayload(usuario, rol, extra = {}) {
  // nombre/apellido son NOT NULL en la base, pero eso no evita que
  // alguien quede con un valor vacio (" ".trim() === "") si en algun
  // punto se guarda sin pasar por una validacion que lo rechace antes.
  // nombre_completo NUNCA debe llegar vacio al frontend: si pasa, cae
  // al mismo nombre de cortesia derivado del correo que usa el
  // dashboard, para que ninguna pantalla termine mostrando el correo
  // completo tal cual ni un saludo en blanco.
  const nombreCompleto = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim() || nombreDesdeCorreo(usuario.email);
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombre_completo: nombreCompleto,
    rol_id: usuario.rol_id,
    rol_codigo: rol ? rol.codigo : null,
    residencial_id: usuario.residencial_id,
    ...extra,
  };
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '8h',
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

// "Recordarme": el checkbox del login pide una sesion mas larga (30 dias)
// en vez de la de siempre (JWT_EXPIRES_IN, por defecto 8h). El resto del
// mecanismo de sesion (cookie httpOnly, tabla sesiones, revocacion) no
// cambia: solo cambia por cuanto tiempo dura.
const REMEMBER_EXPIRES_IN = '30d';

async function createSession(req, usuario, rol, { remember = false } = {}) {
  const jti = crypto.randomUUID();
  const payload = buildPayload(usuario, rol, { jti });
  const token = signToken(payload, remember ? REMEMBER_EXPIRES_IN : undefined);
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
    const { email, password, remember } = req.body || {};
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
    const sessionData = await createSession(req, usuario, rol, { remember: Boolean(remember) });
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
    // "name" viene como un solo campo de texto libre; antes de dividirlo
    // en nombre/apellido hay que asegurarse de que no sea solo espacios
    // (" " es truthy en JS y pasaba la validacion de arriba tal cual).
    if (!String(name).trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
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

    // Sin esto, una residencial nueva (creada aca mismo, por
    // autoregistro) se quedaba sin ningun tipo_incidencia -- y sin uno
    // llamado "Otro" (el respaldo que usa incidencias.js), nadie ahi
    // puede reportar NINGUNA incidencia hasta que alguien la cree a
    // mano. Es idempotente: si la residencial ya existia y ya tenia
    // tipos cargados, no duplica nada.
    await sembrarTiposIncidenciaDefecto(db, residencial.id, transaction);

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
    // Antes esto caia en "|| nombre" cuando la persona solo escribia un
    // nombre (ej. "Ana"), duplicandolo como apellido y guardando
    // "Ana Ana" -- apellido='' es un valor valido (la columna es
    // VARCHAR NOT NULL, no exige que tenga texto), y nombre_completo ya
    // sabe recortar el espacio sobrante cuando apellido viene vacio.
    const apellido = parts.join(' ');
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const usuario = await db.Usuarios.create({
      residencial_id: residencial.id,
      rol_id: rol.id,
      nombre,
      apellido,
      email: normalizedEmail,
      telefono: normalizarTelefonoHN(phone),
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

// Cuanto dura el enlace de recuperacion antes de vencer.
const RESET_TOKEN_TTL_MIN = 30;

// De donde arma el enlace del correo. Si no hay APP_URL en el .env, lo
// arma con el host que llamo a la API (funciona igual para localhost que
// para un dominio real detras de Railway/Render/Nginx).
function frontendBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// POST /api/auth/forgot-password
// Siempre responde el mismo mensaje generico, exista o no el correo, para
// no dejar adivinar desde afuera que direcciones estan registradas.
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const mensajeGenerico = { mensaje: 'Si el correo esta registrado, te enviamos un enlace para recuperar tu contraseña.' };
    if (!email) return res.status(400).json({ error: 'Escribe tu correo electronico.' });

    const usuario = await db.Usuarios.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!usuario || usuario.estado !== 'activo') {
      return res.json(mensajeGenerico);
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.PasswordResets.create({
      usuario_id: usuario.id,
      token_hash: tokenHash(token),
      ip_origen: String(req.ip || '').slice(0, 45) || null,
      fecha_expiracion: new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000),
      usado: false,
    });

    const enlace = `${frontendBaseUrl(req)}/restablecer-password.html?token=${token}`;
    await enviarCorreo({
      para: usuario.email,
      asunto: 'Recupera tu contraseña de VIGIA',
      texto: `Hola ${usuario.nombre},\n\nRecibimos una solicitud para restablecer tu contraseña de VIGIA. Este enlace es valido por ${RESET_TOKEN_TTL_MIN} minutos:\n\n${enlace}\n\nSi tu no pediste esto, puedes ignorar este correo: tu contraseña actual sigue funcionando.`,
    });

    res.json(mensajeGenerico);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Faltan datos para restablecer la contraseña.' });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    const hash = tokenHash(token);
    const reset = await db.PasswordResets.findOne({ where: { token_hash: hash, usado: false } });
    if (!reset || new Date(reset.fecha_expiracion) <= new Date()) {
      return res.status(400).json({ error: 'El enlace de recuperacion es invalido o ya vencio. Solicita uno nuevo.' });
    }

    const usuario = await db.Usuarios.findByPk(reset.usuario_id);
    if (!usuario) return res.status(400).json({ error: 'El enlace de recuperacion ya no es valido.' });

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await usuario.update({ password_hash });
    await reset.update({ usado: true });

    // Cambiar la contraseña cierra todas las sesiones activas de la
    // cuenta (mismo criterio que "cerrar otras sesiones" en Seguridad):
    // si alguien mas tenia una sesion abierta con la clave vieja, queda
    // fuera.
    await db.Sesiones.update({ activa: false }, { where: { usuario_id: usuario.id } });

    res.json({ mensaje: 'Tu contraseña se actualizo correctamente. Ya puedes iniciar sesion.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, me, logout, sessions, revokeSession, forgotPassword, resetPassword, tokenHash };
