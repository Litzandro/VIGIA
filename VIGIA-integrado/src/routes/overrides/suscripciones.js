'use strict';

// Suscripciones: el superadmin ya podia crear filas nuevas y hacer
// PATCH del "estado" (boton Suspender/Activar en suscripciones.html),
// pero no habia forma de EDITAR una fila existente completa (plan,
// ciclo, precio, fecha) -- cada correccion terminaba siendo una fila
// nueva, dejando el historial confuso (caso real: dos residenciales
// llamadas "CEUTEC" con suscripciones sueltas, una decia "prueba" sin
// que quedara claro si esa era la vigente). Este override no cambia
// permisos (sigue siendo solo-superadmin, igual que antes, via
// resourcePermissions.js) -- solo agrega la logica de negocio que le
// faltaba al CRUD generico:
//
//   1) "proxima_facturacion" nunca se acepta del cliente -- siempre se
//      calcula aqui, segun el ciclo (mensual=+30 dias, trimestral=+90,
//      anual=+365). Evita que quede desincronizada de lo que de verdad
//      se guardo.
//   2) Un PATCH que SOLO cambia "estado" a suspendida/vencida/cancelada
//      (el boton rapido "Suspender") NO recalcula la proxima fecha de
//      cobro -- seria incorrecto adelantarla como si se hubiera
//      pagado. Cualquier otro guardado (el formulario completo, o
//      reactivar con "Activar") SI la recalcula desde HOY, tratandolo
//      como el momento del pago/renovacion.

const { primaryKeyWhere } = require('../../utils/crudFactory');
const { _invalidateCache: invalidarCachePlan } = require('../../utils/planAcceso');
const { _invalidateCache: invalidarCacheResidencial } = require('../../utils/residencialAcceso');

const DIAS_POR_CICLO = { mensual: 30, trimestral: 90, anual: 365 };

function calcularProximaFacturacion(desdeISO, ciclo) {
  const dias = DIAS_POR_CICLO[ciclo] || DIAS_POR_CICLO.mensual;
  const base = desdeISO ? new Date(desdeISO) : new Date();
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = function suscripcionesOverride({ router, model, handlers, pkPath }) {
  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);

  router.post('/', async (req, res, next) => {
    try {
      const body = { ...(req.body || {}) };
      delete body.proxima_facturacion;
      body.ciclo = body.ciclo || 'mensual';
      body.fecha_inicio = body.fecha_inicio || hoyISO();
      body.proxima_facturacion = calcularProximaFacturacion(body.fecha_inicio, body.ciclo);
      req.body = body;
      await handlers.create(req, res, next);
      invalidarCachePlan();
      invalidarCacheResidencial();
    } catch (err) { next(err); }
  });

  async function actualizar(req, res, next) {
    try {
      const where = primaryKeyWhere(model, req.params);
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Suscripcion no encontrada' });

      const body = { ...(req.body || {}) };
      delete body.proxima_facturacion; // nunca se confia en un valor mandado por el cliente

      const clavesRecibidas = Object.keys(req.body || {});
      const esSoloToggleDeCorte = clavesRecibidas.length === 1
        && clavesRecibidas[0] === 'estado'
        && ['suspendida', 'vencida', 'cancelada'].includes(body.estado);

      if (!esSoloToggleDeCorte) {
        const ciclo = body.ciclo || row.ciclo;
        body.proxima_facturacion = calcularProximaFacturacion(hoyISO(), ciclo);
      }

      req.body = body;
      await handlers.update(req, res, next);
      invalidarCachePlan();
      invalidarCacheResidencial();
    } catch (err) { next(err); }
  }
  router.put(`/${pkPath}`, actualizar);
  router.patch(`/${pkPath}`, actualizar);

  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      await handlers.remove(req, res, next);
      invalidarCachePlan();
      invalidarCacheResidencial();
    } catch (err) { next(err); }
  });
};
