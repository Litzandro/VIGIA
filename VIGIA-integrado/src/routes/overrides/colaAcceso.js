'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const { normalizarTelefonoHN } = require('../../utils/telefonoHN');
const invitacionesService = require('../../services/invitacionesService');

// Bug real encontrado en auditoria general: completar un registro de la
// cola de garita SOLO actualizaba cola_acceso.estado a "completada" --
// nunca creaba la fila real en "accesos", que es la tabla que de verdad
// leen guardia.html ("quien esta dentro", entradas/salidas de hoy),
// centro-seguridad.html (metricas del dia), "Mis accesos" del residente
// y el conteo de usos de una invitacion QR (usos_actuales). Resultado:
// aunque el guardia procesara visitantes todo el dia por la garita,
// esos numeros se quedaban siempre en cero, y una invitacion de un solo
// uso nunca se marcaba como usada por esta via -- la unica ruta que si
// la consumia (POST /accesos con invitacion_id, en accesos.js) no la
// llama ninguna pantalla real.
//
// Resuelve vehiculo_id (por placa) y visitante_id (por numero de
// documento) cuando puede, para que la persona aparezca de verdad en
// "quien esta dentro". Un visitante sin placa ni documento no tiene
// forma de identificarse de nuevo, asi que no aparecera ahi -- pero SI
// se cuenta en los totales del dia y queda su nombre en observaciones.
async function crearAccesoDesdeCola(row, req, transaction) {
  let vehiculoId = null;
  if (row.placa_vehiculo) {
    const placa = String(row.placa_vehiculo).trim().toUpperCase();
    let vehiculo = await db.Vehiculos.findOne({ where: { residencial_id: row.residencial_id, placa }, transaction });
    if (!vehiculo) {
      vehiculo = await db.Vehiculos.create({ residencial_id: row.residencial_id, placa }, { transaction });
    }
    vehiculoId = vehiculo.id;
  }

  let visitanteId = row.visitante_id || null;
  if (!visitanteId && row.numero_documento) {
    let visitante = await db.Visitantes.findOne({ where: { numero_documento: row.numero_documento }, transaction });
    if (!visitante) {
      const partes = String(row.nombre_persona || 'Visitante').trim().split(/\s+/);
      visitante = await db.Visitantes.create({
        nombre: partes[0] || 'Visitante',
        apellido: partes.slice(1).join(' ') || '—',
        tipo_documento: row.tipo_documento || null,
        numero_documento: row.numero_documento || null,
        telefono: row.telefono || null,
        foto_url: row.foto_url || null,
      }, { transaction });
    }
    visitanteId = visitante.id;
  }

  let invitacionId = null;
  if (row.invitacion_id) {
    invitacionId = row.invitacion_id;
    const invitacion = await db.Invitaciones.findByPk(row.invitacion_id, { transaction, lock: transaction.LOCK.UPDATE });
    const { valido } = invitacionesService.evaluarValidez(invitacion);
    // Si ya no es valida (otro guardia la uso primero, o vencio
    // mientras esta persona esperaba en cola), no bloqueamos el
    // ingreso -- a estas alturas del flujo ya fue "autorizada" y la
    // persona ya esta pasando la garita fisicamente -- pero tampoco se
    // le descuenta un uso que ya no existe. El acceso queda registrado
    // igual, con la referencia a la invitacion para trazabilidad.
    if (invitacion && valido) {
      const nuevosUsos = invitacion.usos_actuales + 1;
      await invitacion.update({
        usos_actuales: nuevosUsos,
        estado: nuevosUsos >= invitacion.max_usos ? 'usada' : invitacion.estado,
      }, { transaction });
    }
  }

  const detalle = [row.nombre_persona || 'Visitante', row.vivienda_destino ? `-> ${row.vivienda_destino}` : '', row.motivo ? `(${row.motivo})` : '']
    .filter(Boolean).join(' ').slice(0, 255);

  return db.Accesos.create({
    residencial_id: row.residencial_id,
    punto_acceso_id: row.punto_acceso_id,
    visitante_id: visitanteId,
    invitacion_id: invitacionId,
    vehiculo_id: vehiculoId,
    guardia_id: req.user.id,
    turno_guardia_id: row.turno_guardia_id || null,
    tipo_movimiento: 'entrada',
    modo_registro: row.origen_registro || 'manual',
    foto_url: row.foto_url || null,
    observaciones: detalle || null,
  }, { transaction });
}

function activeStates() { return ['esperando', 'en_validacion']; }

async function findActiveVeto(residencialId, numeroDocumento, visitanteId) {
  const or = [];
  if (numeroDocumento) or.push({ numero_documento: numeroDocumento });
  if (visitanteId) or.push({ visitante_id: visitanteId });
  if (!or.length) return null;
  const now = new Date();
  return db.VetosAcceso.findOne({
    where: {
      residencial_id: residencialId,
      estado: 'activo',
      [Op.or]: or,
      [Op.and]: [
        { [Op.or]: [{ fecha_desde: null }, { fecha_desde: { [Op.lte]: now } }] },
        { [Op.or]: [{ fecha_hasta: null }, { fecha_hasta: { [Op.gte]: now } }] },
      ],
    },
  });
}

// Misma logica de vigencia (dia/horario/fechas) que
// src/routes/overrides/personasAutorizadas.js. Se duplica aca en vez de
// importarla porque cada override se monta por separado en routes/index.js
// y esto evita acoplar el orden de carga de los dos routers.
function dayIndex(date) { return date.getDay(); }

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

// Busca si la persona que se esta registrando tiene una autorizacion
// recurrente activa (bus escolar, familiar, proveedor, etc.) por
// documento o placa. Antes esto solo se comprobaba para vetos; los
// autorizados se guardaban pero garita nunca los consultaba.
async function findAuthorizedMatch(residencialId, { numero_documento, placa_vehiculo }) {
  const or = [];
  if (numero_documento) or.push({ numero_documento });
  if (placa_vehiculo) or.push({ placa_vehiculo });
  if (!or.length) return null;
  const rows = await db.PersonasAutorizadas.findAll({ where: { residencial_id: residencialId, estado: 'activa', [Op.or]: or } });
  if (!rows.length) return null;
  const now = new Date();
  return rows.find((r) => isWithinSchedule(r, now)) || rows[0];
}

async function countTodayAccesses(residencialId, personaAutorizadaId) {
  if (!personaAutorizadaId) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.ColaAcceso.count({
    where: { residencial_id: residencialId, persona_autorizada_id: personaAutorizadaId, fecha_llegada: { [Op.gte]: start } },
  });
}

async function findCurrentShift(user) {
  if (!user || !user.residencial_id) return null;
  return db.TurnosGuardia.findOne({
    where: {
      residencial_id: user.residencial_id,
      estado: { [Op.in]: ['activo', 'relevado'] },
      [Op.or]: [{ guardia_original_id: user.id }, { guardia_relevo_id: user.id }],
    },
    order: [['inicio_programado', 'DESC']],
  });
}

module.exports = function colaAccesoOverride({ router, model, handlers, pkPath }) {
  router.get('/metricas', async (req, res, next) => {
    try {
      const residencialId = req.user.residencial_id || req.query.residencial_id;
      const rows = await model.findAll({
        where: { residencial_id: residencialId },
        order: [['fecha_llegada', 'DESC']],
        limit: 250,
      });
      const active = rows.filter((r) => activeStates().includes(r.estado));
      const completed = rows.filter((r) => r.fecha_inicio_atencion && r.fecha_fin_atencion);
      const avg = completed.length
        ? Math.round(completed.reduce((acc, r) => acc + (new Date(r.fecha_fin_atencion) - new Date(r.fecha_inicio_atencion)) / 1000, 0) / completed.length)
        : 0;
      const config = await db.ConfiguracionesResidencial.findByPk(residencialId);
      res.json({
        data: {
          esperando: active.filter((r) => r.estado === 'esperando').length,
          en_validacion: active.filter((r) => r.estado === 'en_validacion').length,
          tiempo_promedio_seg: avg,
          objetivo_seg: config ? config.tiempo_objetivo_acceso_seg : 90,
          alerta_cola: config ? active.length >= config.limite_cola_alerta : active.length >= 5,
        },
      });
    } catch (err) { next(err); }
  });

  router.post('/rapido', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      const body = req.body || {};
      if (!body.punto_acceso_id || !String(body.nombre_persona || '').trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Punto de acceso y nombre de la persona son requeridos.' });
      }
      const config = await db.ConfiguracionesResidencial.findByPk(req.user.residencial_id, { transaction });
      // La retroalimentacion exige evidencia obligatoria del guardia. Para el
      // registro rapido, la fotografia es la evidencia minima y reduce el texto.
      if (config && config.requiere_evidencia_guardia && !body.foto_url) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La fotografia es obligatoria como evidencia del acceso.' });
      }
      if (config && config.requiere_foto_visitante && body.origen_registro === 'foto' && !body.foto_url) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Captura la fotografia antes de continuar.' });
      }
      if (body.foto_url && String(body.foto_url).length > 1500000) {
        await transaction.rollback();
        return res.status(413).json({ error: 'La fotografia es demasiado grande. Vuelve a capturarla.' });
      }

      const shift = await findCurrentShift(req.user);
      const veto = await findActiveVeto(req.user.residencial_id, body.numero_documento, body.visitante_id);

      // Revisamos si la persona tiene una autorizacion recurrente (bus
      // escolar, familiar, proveedor...) sin importar si tambien hay un
      // veto: si las dos cosas coinciden a la vez, eso es justo el
      // "conflicto" que administracion debe resolver.
      const autorizacion = body.persona_autorizada_id
        ? await db.PersonasAutorizadas.findOne({ where: { id: body.persona_autorizada_id, residencial_id: req.user.residencial_id } })
        : await findAuthorizedMatch(req.user.residencial_id, { numero_documento: body.numero_documento, placa_vehiculo: body.placa_vehiculo });
      let fueraDeHorario = false;
      let cupoAgotado = false;
      if (autorizacion && !veto) {
        fueraDeHorario = !isWithinSchedule(autorizacion, new Date());
        const usadosHoy = await countTodayAccesses(req.user.residencial_id, autorizacion.id);
        cupoAgotado = usadosHoy >= autorizacion.max_accesos_dia;
      }

      let observaciones = body.observaciones || null;
      let resultadoValidacion = 'pendiente';
      if (veto) {
        resultadoValidacion = 'veto';
        observaciones = `Bloqueo automatico por veto #${veto.id}`;
      } else if (autorizacion) {
        const notas = [`Coincide con autorizacion recurrente #${autorizacion.id} (${autorizacion.nombre_completo}).`];
        if (fueraDeHorario) { resultadoValidacion = 'fuera_horario'; notas.push('Llega fuera del dia/horario autorizado: revisar antes de dejar pasar.'); }
        if (cupoAgotado) notas.push(`Ya alcanzo su limite de accesos autorizados hoy (${autorizacion.max_accesos_dia}).`);
        observaciones = [notas.join(' '), body.observaciones || ''].filter(Boolean).join(' ');
      }

      const row = await model.create({
        residencial_id: req.user.residencial_id,
        punto_acceso_id: body.punto_acceso_id,
        invitacion_id: body.invitacion_id || null,
        persona_autorizada_id: autorizacion ? autorizacion.id : null,
        visitante_id: body.visitante_id || null,
        nombre_persona: String(body.nombre_persona).trim(),
        tipo_documento: body.tipo_documento || null,
        numero_documento: body.numero_documento || null,
        telefono: normalizarTelefonoHN(body.telefono),
        placa_vehiculo: body.placa_vehiculo || null,
        foto_url: body.foto_url || null,
        motivo: body.motivo || null,
        vivienda_destino: body.vivienda_destino || null,
        origen_registro: body.origen_registro || 'manual',
        prioridad: body.prioridad || 'normal',
        estado: veto ? 'bloqueada' : 'esperando',
        resultado_validacion: resultadoValidacion,
        guardia_original_id: req.user.id,
        guardia_actual_id: req.user.id,
        turno_guardia_id: shift ? shift.id : null,
        observaciones,
      }, { transaction });

      if (body.foto_url) {
        await db.EvidenciasAcceso.create({
          residencial_id: req.user.residencial_id,
          cola_acceso_id: row.id,
          guardia_id: req.user.id,
          tipo: 'foto_persona',
          url_archivo: body.foto_url,
          descripcion: 'Fotografia capturada durante registro rapido',
        }, { transaction });
      }

      if (veto) {
        await db.ConflictosPermisos.create({
          residencial_id: req.user.residencial_id,
          persona_autorizada_id: autorizacion ? autorizacion.id : null,
          veto_id: veto.id,
          nombre_persona: row.nombre_persona,
          numero_documento: row.numero_documento,
          descripcion: autorizacion
            ? 'La persona aparece autorizada y vetada al mismo tiempo.'
            : 'Se intento registrar una persona con veto activo.',
          estado: 'abierto',
          detectado_por: req.user.id,
        }, { transaction });
      }

      await transaction.commit();
      if (veto) return res.status(409).json({ error: 'Acceso bloqueado: existe un veto activo.', data: row, veto_id: veto.id });
      return res.status(201).json({
        data: row,
        autorizacion_recurrente: autorizacion ? {
          id: autorizacion.id,
          nombre_completo: autorizacion.nombre_completo,
          tipo: autorizacion.tipo,
          fuera_de_horario: fueraDeHorario,
          cupo_agotado: cupoAgotado,
        } : null,
      });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.patch(`/${pkPath}/atender`, async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where, transaction });
      if (!row) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Registro de cola no encontrado.' });
      }
      const accion = req.body.accion;
      const patch = { guardia_actual_id: req.user.id };
      let acceso = null;
      if (accion === 'iniciar') {
        patch.estado = 'en_validacion';
        patch.fecha_inicio_atencion = row.fecha_inicio_atencion || new Date();
      } else if (accion === 'autorizar') {
        if (['veto', 'conflicto'].includes(row.resultado_validacion) && req.user.rol_codigo === 'guardia') {
          await transaction.rollback();
          return res.status(403).json({ error: 'Un guardia no puede ignorar un veto o conflicto. Debe resolverlo administracion.' });
        }
        patch.estado = 'autorizada';
        patch.resultado_validacion = 'valida';
        patch.fecha_fin_atencion = new Date();
      } else if (accion === 'rechazar') {
        patch.estado = 'rechazada';
        patch.fecha_fin_atencion = new Date();
      } else if (accion === 'completar') {
        if (row.estado === 'completada') {
          // Doble clic o reintento de red: ya se completo antes, no
          // crear un segundo acceso duplicado para el mismo ingreso.
          await transaction.rollback();
          return res.json({ data: row });
        }
        patch.estado = 'completada';
        patch.fecha_fin_atencion = row.fecha_fin_atencion || new Date();
        acceso = await crearAccesoDesdeCola(row, req, transaction);
      } else {
        await transaction.rollback();
        return res.status(400).json({ error: 'Accion invalida.' });
      }
      if (req.body.observaciones) patch.observaciones = req.body.observaciones;
      await row.update(patch, { transaction });
      await transaction.commit();
      res.json({ data: row, acceso });
    } catch (err) {
      await transaction.rollback();
      next(err);
    }
  });

  router.get('/', handlers.list);
  router.post('/', (req, res) => res.status(405).json({ error: 'Usa /api/cola-acceso/rapido para registrar ingresos con validación.' }));
  router.get(`/${pkPath}`, handlers.getOne);
  const adminUpdate = async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Usa la acción de atención correspondiente.' });
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Registro no encontrado.' });
      const allowed = {};
      ['estado','resultado_validacion','observaciones','prioridad','guardia_actual_id'].forEach(k=>{if(req.body[k]!==undefined)allowed[k]=req.body[k]});
      await row.update(allowed); res.json({ data: row });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, adminUpdate);
  router.patch(`/${pkPath}`, adminUpdate);
  router.delete(`/${pkPath}`, handlers.remove);
};
