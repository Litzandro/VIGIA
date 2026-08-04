'use strict';

// Nota: jsonwebtoken y src/models se requieren de forma diferida (dentro
// de las funciones, no al tope del archivo). Para src/models es para
// evitar problemas de orden de carga entre este middleware y el resto
// de la app; para jsonwebtoken es ademas lo que permite probar la
// logica pura de requireRole en scripts/test-offline.js sin tener esa
// dependencia instalada (requireRole no la necesita para nada).
function getDb() {
  return require('../models');
}

function getJwt() {
  return require('jsonwebtoken');
}

// Verifica el JWT del header "Authorization: Bearer <token>" y deja al
// usuario logueado en req.user = { id, email, rol_id, rol_codigo,
// residencial_id }. Es el requisito 1 (login por rol) llevado a cada
// request: sin este middleware, ninguna ruta protegida deja pasar a nadie.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de autenticacion (header Authorization: Bearer <token>)' });
  }

  try {
    const payload = getJwt().verify(token, process.env.JWT_SECRET);
    req.user = payload;
    req.authToken = token;

    // Los tokens nuevos se vinculan a una sesion revocable. Los tokens
    // antiguos sin jti siguen funcionando durante la migracion.
    if (payload.jti) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const db = getDb();
      const session = await db.Sesiones.findOne({
        where: { usuario_id: payload.id, token_hash: hash, activa: true },
      });
      if (!session || new Date(session.fecha_expiracion) <= new Date()) {
        return res.status(401).json({ error: 'La sesion fue cerrada, revocada o expiro.' });
      }
    }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// Chequeo simple por rol (para tablas administrativas sin un permiso
// dedicado en el catalogo, ej. roles/permisos/viviendas). superadmin
// siempre pasa, sin importar la lista.
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.rol_codigo === 'superadmin') return next();
    if (allowedRoles.includes(req.user.rol_codigo)) return next();
    return res.status(403).json({ error: `Esta accion requiere uno de estos roles: ${allowedRoles.join(', ')}` });
  };
}

// Chequeo fino via el catalogo roles_permisos (requisito 13: administrar
// roles y permisos). Cachea el mapa rol_id -> set(codigos de permiso) por
// 60s para no pegarle a la base en cada request; se puede bajar el TTL
// si en el proyecto los permisos cambian muy seguido.
const cache = { map: null, loadedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function loadPermissionMap() {
  const now = Date.now();
  if (cache.map && now - cache.loadedAt < CACHE_TTL_MS) return cache.map;

  const db = getDb();
  const rows = await db.RolesPermisos.findAll({
    include: [{ model: db.Permisos, as: 'permiso' }],
  });

  const map = {};
  rows.forEach((row) => {
    if (!map[row.rol_id]) map[row.rol_id] = new Set();
    if (row.permiso) map[row.rol_id].add(row.permiso.codigo);
  });

  cache.map = map;
  cache.loadedAt = now;
  return map;
}

function requirePermission(codigoPermiso) {
  return async function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.rol_codigo === 'superadmin') return next();

    try {
      const map = await loadPermissionMap();
      const permisos = map[req.user.rol_id] || new Set();
      if (permisos.has(codigoPermiso)) return next();
      return res.status(403).json({ error: `Te falta el permiso "${codigoPermiso}" para esta accion` });
    } catch (err) {
      next(err);
    }
  };
}

// Para rutas que nadie deberia poder llamar directamente por la API
// (ej. escribir en bitacora a mano). Se usa en vez de un rol/permiso.
function blocked(req, res) {
  return res.status(405).json({ error: 'Esta operacion no esta permitida via la API' });
}

module.exports = { requireAuth, requireRole, requirePermission, blocked, _invalidateCache: () => { cache.map = null; } };
