'use strict';

// Centro operativo de seguridad: agrega metricas y alertas de reglas sin
// introducir tablas nuevas ni modificar el esquema existente. Todo se
// calcula desde las tablas transaccionales actuales y respeta el alcance
// por residencial del usuario autenticado.

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth, requireRole('guardia', 'admin', 'superadmin'));

function scope(req) {
  return req.user.rol_codigo === 'superadmin' ? {} : { residencial_id: req.user.residencial_id };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get('/resumen', async (req, res, next) => {
  try {
    const base = scope(req);
    const today = startOfToday();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const [
      accesosHoy,
      entradasHoy,
      salidasHoy,
      colaActiva,
      rechazadosRecientes,
      incidenciasAbiertas,
      incidenciasUrgentes,
      alertasActivas,
      turnosActivos,
      invitacionesPendientes,
      qrUsadosHoy,
      actividad,
      alertas,
      incidencias,
      cola,
    ] = await Promise.all([
      db.Accesos.count({ where: { ...base, fecha_hora: { [Op.gte]: today } } }),
      db.Accesos.count({ where: { ...base, tipo_movimiento: 'entrada', fecha_hora: { [Op.gte]: today } } }),
      db.Accesos.count({ where: { ...base, tipo_movimiento: 'salida', fecha_hora: { [Op.gte]: today } } }),
      db.ColaAcceso.count({ where: { ...base, estado: { [Op.in]: ['esperando', 'en_validacion'] } } }),
      db.ColaAcceso.count({ where: { ...base, estado: { [Op.in]: ['rechazada', 'bloqueada'] }, fecha_llegada: { [Op.gte]: thirtyMinutesAgo } } }),
      db.Incidencias.count({ where: { ...base, estado: { [Op.notIn]: ['resuelta', 'cerrada'] } } }),
      db.Incidencias.count({ where: { ...base, prioridad: 'urgente', estado: { [Op.notIn]: ['resuelta', 'cerrada'] } } }),
      db.AlertasPanico.count({ where: { ...base, estado: 'activa' } }),
      db.TurnosGuardia.count({ where: { ...base, estado: 'activo' } }),
      db.Invitaciones.count({ where: { ...base, estado: 'pendiente', fecha_valida_hasta: { [Op.gte]: new Date() } } }),
      db.Invitaciones.count({ where: { ...base, estado: 'usada', fecha_creacion: { [Op.gte]: today } } }),
      db.Bitacora.findAll({ where: base, order: [['fecha_hora', 'DESC']], limit: 12 }),
      db.AlertasPanico.findAll({ where: { ...base, estado: 'activa' }, order: [['fecha_hora', 'DESC']], limit: 8 }),
      db.Incidencias.findAll({ where: { ...base, estado: { [Op.notIn]: ['resuelta', 'cerrada'] } }, order: [['fecha_hora', 'DESC']], limit: 8 }),
      db.ColaAcceso.findAll({ where: { ...base, estado: { [Op.in]: ['esperando', 'en_validacion', 'rechazada', 'bloqueada'] } }, order: [['fecha_llegada', 'DESC']], limit: 10 }),
    ]);

    const reglas = [];
    if (alertasActivas > 0) reglas.push({ nivel: 'critica', codigo: 'SOS_ACTIVO', mensaje: `${alertasActivas} alerta${alertasActivas === 1 ? '' : 's'} SOS requiere${alertasActivas === 1 ? '' : 'n'} atención inmediata.` });
    if (incidenciasUrgentes > 0) reglas.push({ nivel: 'alta', codigo: 'INCIDENCIA_URGENTE', mensaje: `${incidenciasUrgentes} incidencia${incidenciasUrgentes === 1 ? '' : 's'} urgente${incidenciasUrgentes === 1 ? '' : 's'} sigue${incidenciasUrgentes === 1 ? '' : 'n'} abierta${incidenciasUrgentes === 1 ? '' : 's'}.` });
    if (rechazadosRecientes >= 3) reglas.push({ nivel: 'alta', codigo: 'RECHAZOS_REPETIDOS', mensaje: `Se registraron ${rechazadosRecientes} accesos rechazados o bloqueados en los últimos 30 minutos.` });
    if (colaActiva >= 5) reglas.push({ nivel: 'media', codigo: 'COLA_ALTA', mensaje: `Hay ${colaActiva} personas esperando validación en garita.` });

    const qrRepetidos = await db.Accesos.findAll({
      where: { ...base, invitacion_id: { [Op.ne]: null }, fecha_hora: { [Op.gte]: fifteenMinutesAgo } },
      attributes: ['invitacion_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cantidad']],
      group: ['invitacion_id'],
      having: db.sequelize.literal('COUNT(id) >= 2'),
      limit: 5,
    });
    if (qrRepetidos.length) reglas.push({ nivel: 'alta', codigo: 'QR_REPETIDO', mensaje: 'Se detectaron invitaciones utilizadas varias veces en una ventana de 15 minutos. Revisar accesos recientes.' });

    res.json({
      data: {
        metricas: { accesos_hoy: accesosHoy, entradas_hoy: entradasHoy, salidas_hoy: salidasHoy, cola_activa: colaActiva, incidencias_abiertas: incidenciasAbiertas, incidencias_urgentes: incidenciasUrgentes, alertas_sos: alertasActivas, guardias_activos: turnosActivos, invitaciones_vigentes: invitacionesPendientes, qr_usados_hoy: qrUsadosHoy },
        reglas,
        actividad,
        alertas,
        incidencias,
        cola,
        actualizado_en: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
