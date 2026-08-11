'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere, applyOwnershipScope, applyOwnershipOnCreate } = require('../../utils/crudFactory');

// Mismo criterio que los checkboxes de dias en autorizados.html: 0=domingo..6=sabado.
function dayIndex(date) {
  return date.getDay();
}

// Evalua si una autorizacion recurrente esta vigente AHORA MISMO segun
// su rango de fechas, dias de la semana y franja horaria. Antes estos
// campos se guardaban pero nada los verificaba; esto es lo que los pone
// a funcionar de verdad.
function isWithinSchedule(record, when) {
  const now = when || new Date();
  if (record.fecha_desde && now < new Date(record.fecha_desde)) return false;
  if (record.fecha_hasta) {
    const end = new Date(record.fecha_hasta);
    end.setHours(23, 59, 59, 999);
    if (now > end) return false;
  }
  if (Array.isArray(record.dias_semana_json) && record.dias_semana_json.length) {
    if (!record.dias_semana_json.map(Number).includes(dayIndex(now))) return false;
  }
  if (record.hora_desde || record.hora_hasta) {
    const hhmm = now.toTimeString().slice(0, 5);
    if (record.hora_desde && hhmm < record.hora_desde) return false;
    if (record.hora_hasta && hhmm > record.hora_hasta) return false;
  }
  return true;
}

async function findActiveMatches(residencialId, { numero_documento, placa_vehiculo }) {
  const or = [];
  if (numero_documento) or.push({ numero_documento });
  if (placa_vehiculo) or.push({ placa_vehiculo });
  if (!or.length) return [];
  return db.PersonasAutorizadas.findAll({
    where: { residencial_id: residencialId, estado: 'activa', [Op.or]: or },
  });
}

async function countTodayAccesses(residencialId, personaAutorizadaId) {
  if (!personaAutorizadaId) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.ColaAcceso.count({
    where: { residencial_id: residencialId, persona_autorizada_id: personaAutorizadaId, fecha_llegada: { [Op.gte]: start } },
  });
}

module.exports = function personasAutorizadasOverride({ router, model, handlers, pkPath }) {
  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);

  // Consulta para garita: dado un documento y/o placa, dice si hay una
  // autorizacion recurrente vigente ahora mismo (dia, horario y cupo).
  // La usa control-acceso.js mientras el guardia escribe el registro,
  // y tambien la usa internamente /cola-acceso/rapido al registrar.
  router.get('/verificar', async (req, res, next) => {
    try {
      const matches = await findActiveMatches(req.user.residencial_id, req.query);
      if (!matches.length) return res.json({ data: null });
      const now = new Date();
      const vigente = matches.find((m) => isWithinSchedule(m, now)) || matches[0];
      const usados = await countTodayAccesses(req.user.residencial_id, vigente.id);
      res.json({
        data: {
          id: vigente.id,
          nombre_completo: vigente.nombre_completo,
          tipo: vigente.tipo,
          empresa: vigente.empresa,
          placa_vehiculo: vigente.placa_vehiculo,
          dentro_de_horario: isWithinSchedule(vigente, now),
          hora_desde: vigente.hora_desde,
          hora_hasta: vigente.hora_hasta,
          accesos_hoy: usados,
          max_accesos_dia: vigente.max_accesos_dia,
          cupo_agotado: usados >= vigente.max_accesos_dia,
        },
      });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body || {};
      const nombre = String(body.nombre_completo || '').trim();
      if (!nombre) return res.status(400).json({ error: 'El nombre completo es requerido.' });
      if (!body.tipo) return res.status(400).json({ error: 'Selecciona un tipo de autorizacion.' });

      // Un residente siempre manda la solicitud a revision de admin; solo
      // admin/superadmin pueden activarla directo. Antes el front mandaba
      // estado:'activa' y se autoaprobaba, sin que nadie la revisara.
      const isStaff = ['admin', 'superadmin'].includes(req.user.rol_codigo);
      const estado = isStaff && body.estado ? body.estado : (isStaff ? 'activa' : 'pendiente');

      const data = applyOwnershipOnCreate(model, req.user, {
        tipo: body.tipo,
        nombre_completo: nombre,
        tipo_documento: body.tipo_documento || null,
        numero_documento: body.numero_documento || null,
        telefono: body.telefono || null,
        empresa: body.empresa || null,
        placa_vehiculo: body.placa_vehiculo || null,
        foto_url: body.foto_url || null,
        dias_semana_json: Array.isArray(body.dias_semana_json) ? body.dias_semana_json : null,
        hora_desde: body.hora_desde || null,
        hora_hasta: body.hora_hasta || null,
        fecha_desde: body.fecha_desde || null,
        fecha_hasta: body.fecha_hasta || null,
        max_accesos_dia: body.max_accesos_dia || 2,
        estado,
        notas: body.notas || null,
      });
      const row = await model.create(data);
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  // Aprobar, suspender o cancelar: solo administracion resuelve el
  // estado de una autorizacion (igual que ya se hace con los vetos).
  router.patch(`/${pkPath}/estado`, async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        return res.status(403).json({ error: 'Solo administracion puede aprobar, suspender o cancelar una autorizacion.' });
      }
      const estado = req.body.estado;
      if (!['activa', 'suspendida', 'cancelada'].includes(estado)) {
        return res.status(400).json({ error: 'Estado invalido.' });
      }
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Autorizacion no encontrada.' });
      await row.update({ estado });
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);

  // El residente "elimina" desde autorizados.html, pero la tabla no
  // tiene columna de borrado logico (activo): el CRUD generico haria un
  // DELETE fisico y se perderia el historial de quien estuvo
  // autorizado. Aca lo convertimos en una cancelacion (estado=cancelada).
  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Autorizacion no encontrada.' });
      await row.update({ estado: 'cancelada' });
      res.json({ data: row, mensaje: 'Autorizacion cancelada. Se conserva el historial.' });
    } catch (err) { next(err); }
  });
};

module.exports.isWithinSchedule = isWithinSchedule;
module.exports.findActiveMatches = findActiveMatches;
module.exports.countTodayAccesses = countTodayAccesses;
