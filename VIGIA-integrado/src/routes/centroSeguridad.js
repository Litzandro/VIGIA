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

  // Fiestas/eventos: una sola invitacion (QR) que usan muchas personas.
  // Antes cada invitacion contaba como UNA persona (la ultima entrada), asi
  // que una fiesta con 30 invitados dentro aparecia como 1. Para los
  // eventos se lleva la cuenta entradas - salidas.
  const invIds = [...new Set(rows.map((r) => r.invitacion_id).filter(Boolean))];
  const invEvento = invIds.length
    ? await db.Invitaciones.findAll({ where: { id: { [Op.in]: invIds }, tipo: 'evento' }, attributes: ['id'] })
    : [];
  const eventoIds = new Set(invEvento.map((i) => String(i.id)));
  const saldoEvento = new Map();
  const ultimaEntradaEvento = new Map();
  const latest = new Map();
  for (const row of rows) {
    if (row.invitacion_id && eventoIds.has(String(row.invitacion_id)) && !row.visitante_id) {
      const k = String(row.invitacion_id);
      saldoEvento.set(k, (saldoEvento.get(k) || 0) + (row.tipo_movimiento === 'entrada' ? 1 : -1));
      if (row.tipo_movimiento === 'entrada' && !ultimaEntradaEvento.has(k)) ultimaEntradaEvento.set(k, row);
      continue;
    }
    const key = accessIdentity(row);
    if (key && !latest.has(key)) latest.set(key, row);
  }

  const entradasEvento = [...ultimaEntradaEvento.entries()]
    .filter(([k]) => (saldoEvento.get(k) || 0) > 0)
    .map(([, row]) => row);
  const entries = [...[...latest.values()].filter((row) => row.tipo_movimiento === 'entrada'), ...entradasEvento];
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
    const esEvento = Boolean(entry.invitacion_id && eventoIds.has(String(entry.invitacion_id)) && !entry.visitante_id);
    return {
      entrada_id: entry.id,
      es_evento: esEvento,
      cantidad: esEvento ? (saldoEvento.get(String(entry.invitacion_id)) || 0) : 1,
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

// "Prioritarias" de verdad: primero lo que espera aprobacion o es urgente,
// despues por prioridad y por antiguedad (antes solo iban por fecha).
const PESO_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 };
function priorizarIncidencias(filas) {
  return [...filas].sort((a, b) => {
    const pa = a.estado === 'pendiente_aprobacion' ? -1 : (PESO_PRIORIDAD[a.prioridad] ?? 2);
    const pb = b.estado === 'pendiente_aprobacion' ? -1 : (PESO_PRIORIDAD[b.prioridad] ?? 2);
    if (pa !== pb) return pa - pb;
    return new Date(a.fecha_hora) - new Date(b.fecha_hora);
  });
}

// El contador de accesos del resumen (panel "Resumen operativo" del portal
// de administracion) por defecto es SOLO de hoy -- correcto para una
// revision diaria, pero una residencial con meses de historial tambien
// quiere poder ver "esta semana" o "este mes" sin ir a otra pantalla.
// ?rango=hoy|7|30|todo cambia unicamente "accesos_rango" (accesos_hoy se
// deja intacto: otras pantallas, como el dashboard del guardia, siguen
// asumiendo que ese campo es siempre el conteo de hoy).
function inicioDeRango(rango) {
  if (rango === 'todo') return null;
  const dias = { '7': 7, '30': 30 }[rango];
  const inicio = startOfToday();
  if (dias) inicio.setDate(inicio.getDate() - (dias - 1));
  return inicio;
}

router.get('/resumen', async (req, res, next) => {
  try {
    const base = scope(req);
    const today = startOfToday();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const rango = ['hoy', '7', '30', 'todo'].includes(req.query.rango) ? req.query.rango : 'hoy';
    const inicioRango = inicioDeRango(rango);

    const [
      accesosHoy,
      accesosRango,
      entradasHoy,
      salidasHoy,
      colaActiva,
      rechazadosRecientes,
      incidenciasAbiertas,
      incidenciasUrgentes,
      incidenciasPorAprobar,
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
      db.Accesos.count({ where: { ...base, ...(inicioRango ? { fecha_hora: { [Op.gte]: inicioRango } } : {}) } }),
      db.Accesos.count({ where: { ...base, tipo_movimiento: 'entrada', fecha_hora: { [Op.gte]: today } } }),
      db.Accesos.count({ where: { ...base, tipo_movimiento: 'salida', fecha_hora: { [Op.gte]: today } } }),
      db.ColaAcceso.count({ where: { ...base, estado: { [Op.in]: ['esperando', 'en_validacion'] } } }),
      db.ColaAcceso.count({ where: { ...base, estado: { [Op.in]: ['rechazada', 'bloqueada'] }, fecha_llegada: { [Op.gte]: thirtyMinutesAgo } } }),
      db.Incidencias.count({ where: { ...base, estado: { [Op.in]: ['pendiente_aprobacion', 'reportada', 'en_revision'] } } }),
      db.Incidencias.count({ where: { ...base, prioridad: 'urgente', estado: { [Op.in]: ['pendiente_aprobacion', 'reportada', 'en_revision'] } } }),
      db.Incidencias.count({ where: { ...base, estado: 'pendiente_aprobacion' } }),
      db.AlertasPanico.count({ where: { ...base, estado: 'activa' } }),
      db.TurnosGuardia.count({ where: { ...base, estado: 'activo' } }),
      db.Invitaciones.count({ where: { ...base, estado: 'pendiente', fecha_valida_hasta: { [Op.gte]: new Date() } } }),
      db.Invitaciones.count({ where: { ...base, estado: 'usada', fecha_creacion: { [Op.gte]: today } } }),
      db.Bitacora.findAll({ where: base, order: [['fecha_hora', 'DESC']], limit: 12 }),
      db.AlertasPanico.findAll({ where: { ...base, estado: 'activa' }, order: [['fecha_hora', 'DESC']], limit: 8 }),
      db.Incidencias.findAll({ where: { ...base, estado: { [Op.in]: ['pendiente_aprobacion', 'reportada', 'en_revision'] } }, order: [['fecha_hora', 'DESC']], limit: 60 }),
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
        metricas: { accesos_hoy: accesosHoy, accesos_rango: accesosRango, rango, entradas_hoy: entradasHoy, salidas_hoy: salidasHoy, cola_activa: colaActiva, incidencias_abiertas: incidenciasAbiertas, incidencias_urgentes: incidenciasUrgentes, incidencias_por_aprobar: incidenciasPorAprobar, alertas_sos: alertasActivas, guardias_activos: turnosActivos, invitaciones_vigentes: invitacionesPendientes, qr_usados_hoy: qrUsadosHoy },
        reglas,
        actividad,
        alertas,
        incidencias: priorizarIncidencias(incidencias).slice(0, 8),
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

    // Evento: hay que llevar cuantos siguen dentro; se permite registrar
    // varias salidas de una vez ("cantidad").
    if (entrada.invitacion_id && !entrada.visitante_id) {
      const inv = await db.Invitaciones.findByPk(entrada.invitacion_id);
      if (inv && inv.tipo === 'evento') {
        const movs = await db.Accesos.findAll({
          where: { residencial_id: entrada.residencial_id, invitacion_id: inv.id, visitante_id: null },
          attributes: ['tipo_movimiento'],
        });
        const dentro = movs.reduce((n, m) => n + (m.tipo_movimiento === 'entrada' ? 1 : -1), 0);
        if (dentro <= 0) return res.status(409).json({ error: 'Nadie de este evento sigue dentro.' });
        const cantidad = Math.min(dentro, Math.max(1, parseInt(req.body.cantidad, 10) || 1));
        const filas = Array.from({ length: cantidad }, () => ({
          residencial_id: entrada.residencial_id,
          punto_acceso_id: req.body.punto_acceso_id || entrada.punto_acceso_id,
          usuario_id: entrada.usuario_id,
          invitacion_id: inv.id,
          guardia_id: req.user.id,
          turno_guardia_id: entrada.turno_guardia_id || null,
          guardia_original_nombre: req.user.nombre_completo || null,
          tipo_movimiento: 'salida',
          fecha_hora: new Date(),
          modo_registro: 'manual',
          observaciones: `Salida de evento registrada desde portal de guardia`,
        }));
        const creadas = await db.Accesos.bulkCreate(filas);
        return res.status(201).json({ data: creadas[0], registradas: creadas.length, quedan_dentro: dentro - creadas.length });
      }
    }

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
