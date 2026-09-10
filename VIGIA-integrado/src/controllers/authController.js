'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { validatePassword } = require('../utils/passwordPolicy');
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
    const { nombre: nombreRaw, apellido: apellidoRaw, email, phone, unidad, colonia, codigo_colonia, password, pregunta_seguridad, respuesta_seguridad } = req.body || {};
    if (!nombreRaw || !apellidoRaw || !email || !phone || !unidad || !colonia || !password || !pregunta_seguridad || !respuesta_seguridad) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Completa todos los campos requeridos, incluida la pregunta de seguridad.' });
    }
    // La respuesta de seguridad reemplaza al enlace de correo para
    // recuperar la contraseña (ver recuperarPregunta/verificarRespuesta
    // mas abajo): se exige un minimo de 2 caracteres para que no quede
    // guardada una respuesta vacia o de un solo caracter que cualquiera
    // adivinaria a la primera.
    if (String(respuesta_seguridad).trim().length < 2) {
      await transaction.rollback();
      return res.status(400).json({ error: 'La respuesta de seguridad es demasiado corta.' });
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
    // Misma logica de normalizacion que verificarRespuesta() usa al
    // comparar: sin esto, "Firulais" y "firulais " (con espacio) se
    // guardarian como respuestas distintas y la persona quedaria
    // bloqueada por una diferencia de mayuscula o un espacio de mas.
    const respuestaNormalizada = String(respuesta_seguridad).trim().toLowerCase();
    const respuesta_seguridad_hash = await bcrypt.hash(respuestaNormalizada, BCRYPT_ROUNDS);

    const usuario = await db.Usuarios.create({
      residencial_id: residencial.id,
      rol_id: rol.id,
      nombre,
      apellido,
      email: normalizedEmail,
      telefono: normalizarTelefonoHN(phone),
      password_hash,
      pregunta_seguridad: String(pregunta_seguridad).trim(),
      respuesta_seguridad_hash,
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

    // Antes esto iniciaba sesion automaticamente y mandaba directo al
    // panel -- ahora manda a login para que la persona inicie sesion
    // ella misma con la cuenta recien creada, confirmando que de verdad
    // quedo guardada (en vez de asumirlo). Se probo agregar tambien una
    // verificacion de correo por enlace (Brevo/SMTP) pero se quito: en
    // la practica el correo no llegaba de forma confiable (bloqueos de
    // Gmail, SMTP mal configurado en Railway, etc.) y esta app no va a
    // produccion real, asi que el costo de mantenerlo no se justificaba.
    res.status(201).json({ mensaje: 'Cuenta creada correctamente.' });
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

// Cuanto dura el token de recuperacion antes de vencer (se sigue usando
// el mismo PasswordResets/reset-password de siempre, solo que ahora el
// token no se manda por correo -- se devuelve directo en la respuesta
// de verificarRespuesta, una vez que la persona demuestra que sabe su
// propia respuesta de seguridad).
const RESET_TOKEN_TTL_MIN = 30;

// POST /api/auth/recuperar-pregunta
// Primer paso del nuevo flujo de "olvide mi contraseña": recibe el
// correo y devuelve la pregunta de seguridad que la persona eligio al
// registrarse, para que la conteste en el siguiente paso
// (verificarRespuesta). Reemplaza al viejo forgot-password por correo:
// ese dependia de que el SMTP configurado en Railway entregara el
// enlace de verdad, y en la practica no fue confiable (ver el commit
// que quito la verificacion de correo por el mismo motivo).
async function recuperarPregunta(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Escribe tu correo electronico.' });

    const usuario = await db.Usuarios.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!usuario || usuario.estado !== 'activo' || !usuario.pregunta_seguridad) {
      return res.status(404).json({ error: 'No encontramos una cuenta activa con ese correo y una pregunta de seguridad configurada.' });
    }

    res.json({ pregunta: usuario.pregunta_seguridad });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verificar-respuesta
// Segundo paso: recibe el correo y la respuesta que la persona escribio
// ahora, la compara (normalizada igual que en register()) contra el
// hash guardado, y si coincide crea un PasswordResets normal y devuelve
// su token sin pasar por correo -- restablecer-password.html reusa ese
// token exactamente igual que cuando llegaba por enlace.
async function verificarRespuesta(req, res, next) {
  try {
    const { email, respuesta } = req.body || {};
    if (!email || !respuesta) {
      return res.status(400).json({ error: 'Escribe tu correo y la respuesta.' });
    }

    const usuario = await db.Usuarios.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!usuario || usuario.estado !== 'activo' || !usuario.respuesta_seguridad_hash) {
      return res.status(400).json({ error: 'No pudimos verificar esa cuenta.' });
    }

    const respuestaNormalizada = String(respuesta).trim().toLowerCase();
    const coincide = await bcrypt.compare(respuestaNormalizada, usuario.respuesta_seguridad_hash);
    if (!coincide) {
      return res.status(400).json({ error: 'La respuesta no es correcta.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.PasswordResets.create({
      usuario_id: usuario.id,
      token_hash: tokenHash(token),
      ip_origen: String(req.ip || '').slice(0, 45) || null,
      fecha_expiracion: new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000),
      usado: false,
    });

    res.json({ token });
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

module.exports = { login, register, me, logout, sessions, revokeSession, recuperarPregunta, verificarRespuesta, resetPassword, tokenHash };
