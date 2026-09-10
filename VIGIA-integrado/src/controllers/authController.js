'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { validatePassword } = require('../utils/passwordPolicy');
const { enviarCorreo } = require('../services/envioService');
const { normalizarTelefonoHN } = require('../utils/telefonoHN');
const { sembrarTiposIncidenciaDefecto } = require('../utils/catalogoTiposIncidencia');
const { validarCampos } = require('../config/resourceValidation');

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

  // Limite de dispositivos por cuenta: sin esto, cualquier cantidad de
  // personas podia iniciar sesion al mismo tiempo con la misma cuenta
  // (ej. una contraseña compartida entre varios vecinos), sin ningun
  // limite. Al llegar al maximo, se desactivan las sesiones activas
  // MAS VIEJAS (nunca la que se esta creando ahora mismo) para dejar
  // espacio -- quien estaba en ese dispositivo mas antiguo vera su
  // sesion cerrada la proxima vez que el backend la revise (el mismo
  // guard de 401 que ya redirige a login con "sesion expirada"), no de
  // golpe ni a la mitad de algo que este haciendo.
  const MAX_SESIONES_ACTIVAS = 3;
  const activas = await db.Sesiones.findAll({
    where: { usuario_id: usuario.id, activa: true },
    order: [['fecha_inicio', 'ASC']],
  });
  if (activas.length >= MAX_SESIONES_ACTIVAS) {
    const sobrantes = activas.slice(0, activas.length - MAX_SESIONES_ACTIVAS + 1);
    await db.Sesiones.update(
      { activa: false },
      { where: { id: { [Op.in]: sobrantes.map((s) => s.id) } } }
    );
  }

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

    // Requisito nuevo: confirmar que el correo es de verdad del usuario,
    // no solo que tiene forma de correo (eso ya lo revisa RE_EMAIL en
    // register()). Sin esto, cualquiera podia registrarse con un correo
    // ajeno o inventado y usar la cuenta igual, sin que su dueño real se
    // enterara ni pudiera reaccionar. Se revisa DESPUES de confirmar la
    // contraseña para no darle a un atacante una forma de saber si un
    // correo esta registrado sin conocer la clave.
    if (!usuario.email_verificado) {
      return res.status(403).json({
        error: 'Todavia no confirmaste tu correo. Revisa tu bandeja de entrada (y spam) o pide que te reenviemos el enlace.',
        necesita_verificacion: true,
      });
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
    const { nombre: nombreRaw, apellido: apellidoRaw, email, phone, unidad, colonia, codigo_colonia, password } = req.body || {};
    if (!nombreRaw || !apellidoRaw || !email || !phone || !unidad || !colonia || !password) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Completa todos los campos requeridos.' });
    }
    // Antes el formulario mandaba un solo campo "name" con nombre y
    // apellido ya unidos por el propio frontend, y aca se volvia a
    // partir por el primer espacio -- eso rompia cualquier nombre o
    // apellido compuesto (ej. "Ana Maria" quedaba como nombre="Ana" y
    // apellido="Maria" en vez de nombre="Ana Maria"; "Rodriguez Lopez"
    // como apellido se guardaba entero como un solo apellido en vez de
    // dos). Ahora el formulario manda los dos campos por separado desde
    // el principio y aca ya no hace falta ninguna adivinanza.
    const nombre = String(nombreRaw).trim();
    const apellido = String(apellidoRaw).trim();
    if (!nombre || !apellido) {
      await transaction.rollback();
      return res.status(400).json({ error: 'El nombre y el apellido no pueden estar vacíos.' });
    }

    // Correo con formato real (arroba + dominio) -- antes esto solo
    // exigia "no vacio", asi que "juanperez" sin arroba ni dominio
    // pasaba exactamente igual que un correo de verdad, tanto aqui como
    // en el formulario (que tampoco lo revisaba).
    const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!RE_EMAIL.test(String(email).trim())) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Escribe un correo electronico valido.' });
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

    // Antes esto usaba findOrCreate: cualquiera podia registrarse
    // escribiendo el nombre de una residencial que no existia todavia,
    // y el sistema creaba una fila nueva en "residenciales" sin ninguna
    // verificacion -- cualquiera podia inflar la base de datos con
    // residenciales inventadas solo con registrarse una vez por cada
    // nombre distinto. Ahora la residencial tiene que existir ya de
    // antemano (dada de alta por un superadmin); si no existe, se
    // rechaza el registro con un error claro en vez de crearla sola.
    const residencial = await db.Residenciales.findOne({
      where: { nombre: String(colonia).trim() },
      transaction,
    });
    if (!residencial) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Esa colonia/residencial no esta registrada en VIGIA. Contacta a soporte.' });
    }

    // Codigo de colonia (requisito nuevo): confirma que quien se
    // registra de verdad tiene el codigo que administracion entrega a
    // sus residentes reales -- sin esto, cualquiera podia elegir
    // cualquier residencial de la lista y quedar adentro sin ninguna
    // prueba de que vive ahi. Si la residencial todavia no tiene un
    // codigo configurado (codigo_registro es NULL -- dato sembrado
    // antes de este cambio), se deja pasar sin exigirlo, para no
    // trabar de golpe residenciales ya en uso.
    if (residencial.codigo_registro) {
      const codigoNormalizado = String(codigo_colonia || '').trim().toUpperCase();
      if (codigoNormalizado !== String(residencial.codigo_registro).trim().toUpperCase()) {
        await transaction.rollback();
        return res.status(403).json({ error: 'El código de la colonia no es correcto. Pídeselo a administración.' });
      }
    }

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

    // El registro publico es el punto de entrada mas expuesto de toda la
    // app -- cualquiera en internet puede llamarlo sin sesion. Antes de
    // este chequeo, no habia NADA que impidiera registrarse con un
    // nombre como "12345" o un telefono con letras: el unico requisito
    // era que los campos no vinieran vacios.
    const erroresRegistro = validarCampos(db.Usuarios, { nombre, apellido: apellido || null, telefono: phone });
    if (erroresRegistro.length) {
      await transaction.rollback();
      return res.status(400).json({ error: erroresRegistro[0] });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Token de confirmacion de correo: se genera y guarda YA (dentro de
    // la misma transaccion que crea la cuenta) para no dejar una cuenta
    // creada sin ninguna forma de confirmarla si el envio del correo
    // falla despues -- en ese caso el usuario puede pedir que se le
    // reenvie con /api/auth/reenviar-verificacion, que genera uno nuevo.
    const tokenVerificacion = crypto.randomBytes(32).toString('hex');

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
      email_verificado: false,
      token_verificacion: tokenHash(tokenVerificacion),
      token_verificacion_expira: new Date(Date.now() + VERIFICACION_TOKEN_TTL_MIN * 60 * 1000),
    }, { transaction });

    await db.Residentes.create({
      usuario_id: usuario.id,
      vivienda_id: vivienda.id,
      tipo_residente: 'propietario',
      fecha_ingreso: new Date(),
    }, { transaction });

    await transaction.commit();

    // El correo se manda DESPUES de confirmar la transaccion (si el
    // envio falla, la cuenta ya quedo creada de todas formas -- el
    // usuario puede pedir un reenvio en vez de perder el registro
    // completo por un problema del proveedor de correo).
    const enlaceVerificacion = `${frontendBaseUrl(req)}/api/auth/verificar-correo?token=${tokenVerificacion}`;
    try {
      await enviarCorreo({
        para: usuario.email,
        asunto: 'Confirma tu correo en VIGIA',
        texto: `Hola ${usuario.nombre},\n\nGracias por registrarte en VIGIA. Confirma que este correo es tuyo entrando a este enlace (valido por ${VERIFICACION_TOKEN_TTL_MIN / 60} horas):\n\n${enlaceVerificacion}\n\nSi tu no creaste esta cuenta, puedes ignorar este correo.`,
      });
    } catch (errCorreo) {
      // No se revierte el registro por esto -- se deja que el usuario
      // pida un reenvio desde login.html si el correo nunca le llego.
      console.error('[register] fallo el envio del correo de verificacion:', errCorreo.message);
    }

    // Antes esto iniciaba sesion automaticamente y mandaba directo al
    // panel. Ahora nunca inicia sesion sola aqui -- ni aunque el correo
    // se mande bien -- porque la cuenta todavia no esta verificada
    // (login() la rechaza hasta que email_verificado sea true), asi que
    // no tendria caso devolver una sesion que no se puede usar todavia.
    res.status(201).json({
      mensaje: 'Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesion.',
      necesita_verificacion: true,
    });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
}

const VERIFICACION_TOKEN_TTL_MIN = 24 * 60;

// GET /api/auth/verificar-correo?token=...
async function verificarCorreo(req, res, next) {
  try {
    const { token } = req.query || {};
    if (!token) return res.redirect('/login.html?verificacion=invalida');

    const hash = tokenHash(String(token));
    const usuario = await db.Usuarios.findOne({ where: { token_verificacion: hash } });
    if (!usuario || !usuario.token_verificacion_expira || new Date(usuario.token_verificacion_expira) <= new Date()) {
      return res.redirect('/login.html?verificacion=invalida');
    }

    await usuario.update({ email_verificado: true, token_verificacion: null, token_verificacion_expira: null });
    return res.redirect('/login.html?verificacion=ok');
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reenviar-verificacion
// Mismo criterio anti-enumeracion que forgot-password: siempre responde
// el mismo mensaje generico, exista o no la cuenta, o ya este verificada.
async function reenviarVerificacion(req, res, next) {
  try {
    const { email } = req.body || {};
    const mensajeGenerico = { mensaje: 'Si la cuenta existe y todavia no esta confirmada, te reenviamos el correo.' };
    if (!email) return res.status(400).json({ error: 'Escribe tu correo electronico.' });

    const usuario = await db.Usuarios.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!usuario || usuario.email_verificado) {
      return res.json(mensajeGenerico);
    }

    const tokenVerificacion = crypto.randomBytes(32).toString('hex');
    await usuario.update({
      token_verificacion: tokenHash(tokenVerificacion),
      token_verificacion_expira: new Date(Date.now() + VERIFICACION_TOKEN_TTL_MIN * 60 * 1000),
    });

    const enlaceVerificacion = `${frontendBaseUrl(req)}/api/auth/verificar-correo?token=${tokenVerificacion}`;
    await enviarCorreo({
      para: usuario.email,
      asunto: 'Confirma tu correo en VIGIA',
      texto: `Hola ${usuario.nombre},\n\nConfirma que este correo es tuyo entrando a este enlace (valido por ${VERIFICACION_TOKEN_TTL_MIN / 60} horas):\n\n${enlaceVerificacion}\n\nSi tu no pediste esto, puedes ignorar este correo.`,
    });

    res.json(mensajeGenerico);
  } catch (err) {
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

module.exports = { login, register, me, logout, sessions, revokeSession, forgotPassword, resetPassword, verificarCorreo, reenviarVerificacion, tokenHash };
