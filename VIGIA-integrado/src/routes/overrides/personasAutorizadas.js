'use strict';

const db = require('../../models');
const { normalizarTelefonoHN } = require('../../utils/telefonoHN');
const { Op } = require('sequelize');
const { primaryKeyWhere, applyOwnershipScope, applyOwnershipOnCreate } = require('../../utils/crudFactory');
const { validarCampos } = require('../../config/resourceValidation');

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

      const errores = validarCampos(model, {
        nombre_completo: nombre,
        numero_documento: body.numero_documento,
        telefono: body.telefono,
        placa_vehiculo: body.placa_vehiculo,
        empresa: body.empresa,
        max_accesos_dia: body.max_accesos_dia,
      });
      if (errores.length) return res.status(400).json({ error: 'Datos invalidos', detalles: errores });

      // Un residente siempre manda la solicitud a revision de admin; solo
      // admin/superadmin pueden activarla directo. Antes el front mandaba
      // estado:'activa' y se autoaprobaba, sin que nadie la revisara.
      const isStaff = ['admin', 'superadmin'].includes(req.user.rol_codigo);
      const estado = isStaff && body.estado ? body.estado : (isStaff ? 'activa' : 'pendiente');

      // Bug real: cuando quien crea es un residente, applyOwnershipOnCreate
      // (mas abajo) rellena residente_id solo con el id de quien esta
      // logueado -- pero cuando quien crea es admin/superadmin (el "activarla
      // directo" del comentario de arriba), nadie rellenaba residente_id en
      // ningun lado: no se leia de req.body, no se auto-asignaba. El
      // resultado era que la fila SIEMPRE fallaba con "residente_id cannot
      // be null" en cuanto un admin intentaba crear una autorizacion --
      // encontrado probando el flujo completo admin -> autorizados contra un
      // servidor real, nunca antes reportado porque el formulario actual de
      // autorizados.html solo lo usan residentes (que si funcionan bien).
      if (isStaff && !body.residente_id) {
        return res.status(400).json({ error: 'Selecciona a que residente pertenece esta autorizacion.' });
      }
      if (isStaff && body.residente_id) {
        // Confirma que el residente_id que mando el admin de verdad
        // pertenezca a SU MISMA residencial -- sin esto, un admin podria
        // (por error o a proposito) crear una autorizacion apuntando al
        // id de un residente de otra residencial por completo.
        const residenteWhere = { usuario_id: body.residente_id };
        if (req.user.rol_codigo !== 'superadmin') {
          const usuarioDelResidente = await db.Usuarios.findOne({ where: { id: body.residente_id, residencial_id: req.user.residencial_id } });
          if (!usuarioDelResidente) return res.status(400).json({ error: 'Ese residente no pertenece a tu residencial.' });
        }
      }

      const data = applyOwnershipOnCreate(model, req.user, {
        tipo: body.tipo,
        nombre_completo: nombre,
        tipo_documento: body.tipo_documento || null,
        numero_documento: body.numero_documento || null,
        telefono: normalizarTelefonoHN(body.telefono),
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
        // Solo se usa cuando applyOwnershipOnCreate NO lo rellena ya (o
        // sea, cuando quien crea no es un residente): admin/superadmin
        // deben decir explicitamente a que residente pertenece.
        ...(isStaff ? { residente_id: body.residente_id } : {}),
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
