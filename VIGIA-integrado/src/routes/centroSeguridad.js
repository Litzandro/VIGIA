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


function accessIdentity(row) {
  if (row.visitante_id) return `visitante:${row.visitante_id}`;
  if (row.invitacion_id) return `invitacion:${row.invitacion_id}`;
  if (row.vehiculo_id) return `vehiculo:${row.vehiculo_id}`;
  if (row.usuario_id) return `usuario:${row.usuario_id}`;
  return null;
}

async function personasDentro(base) {
  const rows = await db.Accesos.findAll({
    where: base,
    order: [['fecha_hora', 'DESC']],
    limit: 600,
  });

  const latest = new Map();
  for (const row of rows) {
    const key = accessIdentity(row);
    if (key && !latest.has(key)) latest.set(key, row);
  }

  const entries = [...latest.values()].filter((row) => row.tipo_movimiento === 'entrada');
  const visitanteIds = [...new Set(entries.map((r) => r.visitante_id).filter(Boolean))];
  const invitacionIds = [...new Set(entries.map((r) => r.invitacion_id).filter(Boolean))];
  const vehiculoIds = [...new Set(entries.map((r) => r.vehiculo_id).filter(Boolean))];
  const puntoIds = [...new Set(entries.map((r) => r.punto_acceso_id).filter(Boolean))];

  const [visitantes, invitaciones, vehiculos, puntos] = await Promise.all([
    visitanteIds.length ? db.Visitantes.findAll({ where: { id: { [Op.in]: visitanteIds } } }) : [],
    invitacionIds.length ? db.Invitaciones.findAll({ where: { id: { [Op.in]: invitacionIds } } }) : [],
    vehiculoIds.length ? db.Vehiculos.findAll({ where: { id: { [Op.in]: vehiculoIds } } }) : [],
    puntoIds.length ? db.PuntosAcceso.findAll({ where: { id: { [Op.in]: puntoIds } } }) : [],
  ]);

  const residenteIds = [...new Set(invitaciones.map((i) => i.residente_id).filter(Boolean))];
  const residentes = residenteIds.length
    ? await db.Residentes.findAll({ where: { usuario_id: { [Op.in]: residenteIds } } })
    : [];
  const viviendaIds = [...new Set(residentes.map((r) => r.vivienda_id).filter(Boolean))];
  const viviendas = viviendaIds.length
    ? await db.Viviendas.findAll({ where: { id: { [Op.in]: viviendaIds } } })
    : [];

  const visitorMap = new Map(visitantes.map((v) => [String(v.id), v]));
  const invitationMap = new Map(invitaciones.map((i) => [String(i.id), i]));
  const vehicleMap = new Map(vehiculos.map((v) => [String(v.id), v]));
  const pointMap = new Map(puntos.map((pt) => [String(pt.id), pt]));
  const residentMap = new Map(residentes.map((r) => [String(r.usuario_id), r]));
  const viviendaMap = new Map(viviendas.map((v) => [String(v.id), v]));

  return entries.map((entry) => {
    const v = entry.visitante_id ? visitorMap.get(String(entry.visitante_id)) : null;
    const inv = entry.invitacion_id ? invitationMap.get(String(entry.invitacion_id)) : null;
    const veh = entry.vehiculo_id ? vehicleMap.get(String(entry.vehiculo_id)) : null;
    const resident = inv ? residentMap.get(String(inv.residente_id)) : null;
    const vivienda = resident ? viviendaMap.get(String(resident.vivienda_id)) : null;
    const nombre = v ? `${v.nombre || ''} ${v.apellido || ''}`.trim() : (inv && inv.nombre_evento ? inv.nombre_evento : `Acceso #${entry.id}`);
    return {
      entrada_id: entry.id,
      nombre,
      telefono: v ? (v.telefono || null) : null,
      residente_id: inv ? (inv.residente_id || null) : null,
      visitante_id: entry.visitante_id || null,
      invitacion_id: entry.invitacion_id || null,
      vehiculo_id: entry.vehiculo_id || null,
      placa: veh ? veh.placa : null,
      vivienda: vivienda ? `${vivienda.bloque_torre ? vivienda.bloque_torre + ' · ' : ''}${vivienda.numero}` : null,
      punto: pointMap.get(String(entry.punto_acceso_id))?.nombre || `Punto #${entry.punto_acceso_id}`,
      fecha_entrada: entry.fecha_hora,
      modo_registro: entry.modo_registro,
    };
  });
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

    const [enSitio, turnoActual] = await Promise.all([
      personasDentro(base),
      db.TurnosGuardia.findOne({
        where: {
          ...base,
          estado: { [Op.in]: ['programado', 'activo', 'relevado'] },
          ...(req.user.rol_codigo === 'guardia' ? { [Op.or]: [{ guardia_original_id: req.user.id }, { guardia_relevo_id: req.user.id }] } : {}),
        },
        order: [['inicio_programado', 'DESC']],
      }),
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
        en_sitio: enSitio,
        turno_actual: turnoActual,
        actualizado_en: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});


router.post('/salida/:entradaId', async (req, res, next) => {
  try {
    const where = { id: req.params.entradaId, tipo_movimiento: 'entrada' };
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    const entrada = await db.Accesos.findOne({ where });
    if (!entrada) return res.status(404).json({ error: 'La entrada no existe o no pertenece a tu residencial.' });

    const identity = {};
    if (entrada.visitante_id) identity.visitante_id = entrada.visitante_id;
    else if (entrada.invitacion_id) identity.invitacion_id = entrada.invitacion_id;
    else if (entrada.vehiculo_id) identity.vehiculo_id = entrada.vehiculo_id;
    else if (entrada.usuario_id) identity.usuario_id = entrada.usuario_id;
    else return res.status(409).json({ error: 'Este acceso no tiene una identidad suficiente para registrar una salida automática.' });

    const posterior = await db.Accesos.findOne({
      where: {
        residencial_id: entrada.residencial_id,
        ...identity,
        fecha_hora: { [Op.gt]: entrada.fecha_hora },
      },
      order: [['fecha_hora', 'DESC']],
    });
    if (posterior && posterior.tipo_movimiento === 'salida') {
      return res.status(409).json({ error: 'Esta persona ya tiene una salida registrada.' });
    }
    if (posterior && posterior.tipo_movimiento === 'entrada') {
      return res.status(409).json({ error: 'Existe una entrada más reciente. Actualiza el panel antes de registrar la salida.' });
    }

    const salida = await db.Accesos.create({
      residencial_id: entrada.residencial_id,
      punto_acceso_id: req.body.punto_acceso_id || entrada.punto_acceso_id,
      usuario_id: entrada.usuario_id,
      visitante_id: entrada.visitante_id,
      invitacion_id: entrada.invitacion_id,
      vehiculo_id: entrada.vehiculo_id,
      camara_id: null,
      guardia_id: req.user.id,
      turno_guardia_id: entrada.turno_guardia_id || null,
      guardia_original_nombre: req.user.nombre_completo || null,
      tipo_movimiento: 'salida',
      fecha_hora: new Date(),
      modo_registro: 'manual',
      observaciones: req.body.observaciones || `Salida registrada desde portal de guardia; entrada #${entrada.id}`,
    });

    res.status(201).json({ data: salida });
  } catch (err) { next(err); }
});

module.exports = router;
