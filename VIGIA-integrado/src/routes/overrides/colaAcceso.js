'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');

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
      const row = await model.create({
        residencial_id: req.user.residencial_id,
        punto_acceso_id: body.punto_acceso_id,
        invitacion_id: body.invitacion_id || null,
        persona_autorizada_id: body.persona_autorizada_id || null,
        visitante_id: body.visitante_id || null,
        nombre_persona: String(body.nombre_persona).trim(),
        tipo_documento: body.tipo_documento || null,
        numero_documento: body.numero_documento || null,
        telefono: body.telefono || null,
        placa_vehiculo: body.placa_vehiculo || null,
        foto_url: body.foto_url || null,
        motivo: body.motivo || null,
        vivienda_destino: body.vivienda_destino || null,
        origen_registro: body.origen_registro || 'manual',
        prioridad: body.prioridad || 'normal',
        estado: veto ? 'bloqueada' : 'esperando',
        resultado_validacion: veto ? 'veto' : 'pendiente',
        guardia_original_id: req.user.id,
        guardia_actual_id: req.user.id,
        turno_guardia_id: shift ? shift.id : null,
        observaciones: veto ? `Bloqueo automatico por veto #${veto.id}` : body.observaciones || null,
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
          persona_autorizada_id: body.persona_autorizada_id || null,
          veto_id: veto.id,
          nombre_persona: row.nombre_persona,
          numero_documento: row.numero_documento,
          descripcion: body.persona_autorizada_id
            ? 'La persona aparece autorizada y vetada al mismo tiempo.'
            : 'Se intento registrar una persona con veto activo.',
          estado: 'abierto',
          detectado_por: req.user.id,
        }, { transaction });
      }

      await transaction.commit();
      if (veto) return res.status(409).json({ error: 'Acceso bloqueado: existe un veto activo.', data: row, veto_id: veto.id });
      return res.status(201).json({ data: row });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.patch(`/${pkPath}/atender`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Registro de cola no encontrado.' });
      const accion = req.body.accion;
      const patch = { guardia_actual_id: req.user.id };
      if (accion === 'iniciar') {
        patch.estado = 'en_validacion';
        patch.fecha_inicio_atencion = row.fecha_inicio_atencion || new Date();
      } else if (accion === 'autorizar') {
        if (['veto', 'conflicto'].includes(row.resultado_validacion) && req.user.rol_codigo === 'guardia') {
          return res.status(403).json({ error: 'Un guardia no puede ignorar un veto o conflicto. Debe resolverlo administracion.' });
        }
        patch.estado = 'autorizada';
        patch.resultado_validacion = 'valida';
        patch.fecha_fin_atencion = new Date();
      } else if (accion === 'rechazar') {
        patch.estado = 'rechazada';
        patch.fecha_fin_atencion = new Date();
      } else if (accion === 'completar') {
        patch.estado = 'completada';
        patch.fecha_fin_atencion = new Date();
      } else {
        return res.status(400).json({ error: 'Accion invalida.' });
      }
      if (req.body.observaciones) patch.observaciones = req.body.observaciones;
      await row.update(patch);
      res.json({ data: row });
    } catch (err) { next(err); }
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
