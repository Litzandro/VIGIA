'use strict';

// Registra automaticamente un router CRUD (protegido por rol/permiso y
// con scoping multi-residencial) por cada modelo cargado en
// src/models. Agregar una tabla nueva = correr generate-models y
// automaticamente aparece aca como /api/<recurso>, con al menos
// requireAuth aplicado por defecto.
//
// Algunas tablas necesitan logica de negocio que un CRUD generico no
// puede cubrir (generar un QR, notificar al crear un acceso, etc.):
// esas tienen un "override" en src/routes/overrides/ que toma control
// total del router de esa tabla.

const express = require('express');
const db = require('../models');
const { createCrudHandlers, attachStandardCrud } = require('../utils/crudFactory');
const { buildAccessMiddleware } = require('../utils/buildAccessMiddleware');
const resourcePermissions = require('../config/resourcePermissions');

const router = express.Router();
const NON_MODEL_KEYS = new Set(['sequelize', 'Sequelize']);

// Paqueteria y Llegada segura se quitaron del sistema (el equipo ya las
// habia quitado en otras partes del proyecto). Se excluyen aqui mismo,
// en el registro automatico de rutas, en vez de borrar los modelos o
// las tablas de la base de datos: asi ningun endpoint /api/paquetes ni
// /api/llegadas-seguras queda expuesto (responden 404, como cualquier
// ruta que no existe), pero el cambio es minimo y facil de revertir si
// alguna vez hiciera falta -- no se toca database/vigia_schema.sql ni
// se corre ninguna migracion.
const RECURSOS_DESACTIVADOS = new Set(['paquetes', 'llegadas_seguras']);

const overrides = {
  residenciales: require('./overrides/residenciales'),
  usuarios: require('./overrides/usuarios'),
  invitaciones: require('./overrides/invitaciones'),
  accesos: require('./overrides/accesos'),
  alertas_panico: require('./overrides/alertasPanico'),
  conflictos_permisos: require('./overrides/conflictosPermisos'),
  incidencias: require('./overrides/incidencias'),
  cola_acceso: require('./overrides/colaAcceso'),
  vetos_acceso: require('./overrides/vetosAcceso'),
  personas_autorizadas: require('./overrides/personasAutorizadas'),
  preferencias_usuario: require('./overrides/preferenciasUsuario'),
  dispositivos_usuario: require('./overrides/dispositivosUsuario'),
  contactos_emergencia: require('./overrides/contactosEmergencia'),
  publicaciones_comunidad: require('./overrides/publicacionesComunidad'),
  publicaciones_reportes: require('./overrides/publicacionesReportes'),
  integraciones: require('./overrides/integraciones'),
  turnos_guardia: require('./overrides/turnosGuardia'),
  mensajes: require('./overrides/mensajes'),
  incidencias_evidencias: require('./overrides/incidenciasEvidencias'),
  sanciones_usuarios: require('./overrides/sancionesUsuarios'),
};

function toKebabCase(snakeCase) {
  return snakeCase.replace(/_/g, '-');
}

const registeredResources = [];

Object.keys(db)
  .filter((key) => !NON_MODEL_KEYS.has(key))
  .forEach((modelName) => {
    const model = db[modelName];
    const tableName = model.getTableName();
    if (RECURSOS_DESACTIVADOS.has(tableName)) return;
    const handlers = createCrudHandlers(model);
    const resource = toKebabCase(tableName);
    const pkPath = model.primaryKeyAttributes.map((attr) => `:${attr}`).join('/');
    const rules = resourcePermissions[tableName] || {};

    const resourceRouter = express.Router();

    // Cada verbo lleva su propio middleware de acceso segun
    // resourcePermissions.js (o "solo estar logueado" si la tabla no
    // esta configurada ahi). Se inyecta ANTES de montar las rutas
    // reales, asi tanto el CRUD generico como los overrides quedan
    // igual de protegidos.
    resourceRouter.use((req, res, next) => {
      const accion = { GET: 'read', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'remove' }[req.method];
      // Las rutas propias ("/me") ya vienen protegidas por diseño: cada
      // override las limita a los datos del propio usuario autenticado
      // (req.user.id), así que no deben exigir además el permiso
      // administrativo completo del recurso (p.ej. "usuarios.gestionar").
      // Sin este bypass, ningún residente o guardia podía ver ni editar
      // su propio perfil vía GET/PUT /usuarios/me -- se quedaba
      // bloqueado con 403 antes de llegar siquiera al handler de /me.
      const middlewares = req.path === '/me'
        ? buildAccessMiddleware(null)
        : buildAccessMiddleware(rules[accion]);
      let i = 0;
      const runNext = (err) => {
        if (err) return next(err);
        if (i >= middlewares.length) return next();
        const mw = middlewares[i++];
        mw(req, res, runNext);
      };
      runNext();
    });

    // Idempotencia para acciones creadas sin conexión. Si el teléfono
    // reintenta una petición que el servidor ya procesó, devolvemos 409 y
    // el cliente la elimina de su cola sin duplicar accesos o incidencias.
    resourceRouter.use(async (req, res, next) => {
      const clientUid = req.get('X-VIGIA-OFFLINE-ID');
      if (!clientUid || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || tableName === 'acciones_offline') return next();
      try {
        const [offlineRow, created] = await db.AccionesOffline.findOrCreate({
          where: { client_uid: clientUid },
          defaults: {
            client_uid: clientUid,
            usuario_id: req.user.id,
            residencial_id: req.user.residencial_id || null,
            modulo: tableName,
            accion: `${req.method} ${req.path}`.slice(0, 60),
            payload_json: req.body || {},
            estado: 'recibida',
            intentos: 1,
            fecha_cliente: req.get('X-VIGIA-OFFLINE-DATE') || null,
          },
        });
        if (!created && ['procesada', 'duplicada'].includes(offlineRow.estado)) {
          if (offlineRow.estado !== 'duplicada') await offlineRow.update({ estado: 'duplicada', intentos: offlineRow.intentos + 1 });
          return res.status(409).json({ error: 'Acción offline ya procesada.', duplicada: true, client_uid: clientUid });
        }
        if (!created) await offlineRow.update({ intentos: offlineRow.intentos + 1, estado: 'recibida', mensaje_error: null });
        res.on('finish', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          offlineRow.update({
            estado: ok ? 'procesada' : 'error',
            fecha_procesamiento: ok ? new Date() : null,
            mensaje_error: ok ? null : `HTTP ${res.statusCode}`,
          }).catch(() => {});
        });
        next();
      } catch (err) { next(err); }
    });

    const override = overrides[tableName];
    if (override) {
      override({ router: resourceRouter, model, handlers, pkPath });
    } else {
      attachStandardCrud(resourceRouter, handlers, pkPath);
    }

    router.use(`/${resource}`, resourceRouter);
    registeredResources.push(`/api/${resource}`);
  });

// Endpoint de salud: confirma que el servidor y la conexion a MySQL
// estan arriba. No requiere login (util para health checks de infra).
router.get('/health', async (req, res) => {
  try {
    await db.sequelize.authenticate();
    res.json({ status: 'ok', db: 'conectada', recursos: registeredResources.length });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'sin conexion', detalle: err.message });
  }
});

router.get('/', (req, res) => {
  res.json({ recursos: registeredResources, extra: ['/api/auth/login', '/api/auth/me', '/api/reportes/*'] });
});

router.use('/reportes', require('./reportes'));
router.use('/centro-seguridad', require('./centroSeguridad'));

module.exports = router;
