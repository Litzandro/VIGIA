'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');

function normalizePriority(value) {
  const map = { baja: 'baja', media: 'media', alta: 'alta', urgente: 'urgente' };
  return map[String(value || '').toLowerCase()] || 'media';
}

module.exports = function incidenciasOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      // Privacidad solicitada en la retroalimentacion: un residente solo
      // consulta sus propios reportes, incluso si conoce otro id.
      if (req.user.rol_codigo === 'residente') where.reportado_por = req.user.id;
      if (req.query.estado && model.rawAttributes.estado) where.estado = req.query.estado;
      if (req.query.prioridad && model.rawAttributes.prioridad) where.prioridad = req.query.prioridad;
      if (req.query.q) {
        where[Op.or] = [
          { titulo: { [Op.like]: `%${req.query.q}%` } },
          { descripcion: { [Op.like]: `%${req.query.q}%` } },
        ];
      }
      const rows = await model.findAll({ where, order: [['fecha_hora', 'DESC']], limit: 200 });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      const body = req.body || {};
      const titulo = String(body.titulo || '').trim();
      const descripcion = String(body.descripcion || '').trim();
      if (!titulo || !descripcion) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El titulo y la descripcion son requeridos.' });
      }
      if (titulo.length > 150 || descripcion.length > 500) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El titulo admite 150 caracteres y la descripcion 500.' });
      }
      // El guardia debe adjuntar evidencia al reportar desde garita.
      if (req.user.rol_codigo === 'guardia' && !body.evidencia_url) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El guardia debe adjuntar una fotografia o evidencia.' });
      }

      let tipoId = body.tipo_incidencia_id;
      if (!tipoId) {
        const tipo = await db.TiposIncidencia.findOne({
          where: { nombre: 'Otro', activo: true },
          transaction,
        });
        tipoId = tipo && tipo.id;
      }
      if (!tipoId) throw new Error('No existe un tipo de incidencia disponible.');

      const incidencia = await model.create({
        residencial_id: req.user.residencial_id || body.residencial_id,
        tipo_incidencia_id: tipoId,
        reportado_por: req.user.id,
        asignado_a: body.asignado_a || null,
        guardia_original_nombre: req.user.rol_codigo === 'guardia' ? req.user.nombre_completo : null,
        titulo,
        descripcion,
        visibilidad: ['privada', 'administracion', 'comunidad'].includes(body.visibilidad) ? body.visibilidad : 'privada',
        ubicacion: body.ubicacion || null,
        prioridad: normalizePriority(body.prioridad),
        estado: 'reportada',
      }, { transaction });

      let evidencia = null;
      if (body.evidencia_url) {
        if (String(body.evidencia_url).length > 1500000) {
          await transaction.rollback();
          return res.status(413).json({ error: 'La fotografia es demasiado grande. Usa una imagen comprimida.' });
        }
        evidencia = await db.IncidenciasEvidencias.create({
          incidencia_id: incidencia.id,
          tipo_archivo: body.evidencia_tipo || 'imagen',
          url_archivo: body.evidencia_url,
        }, { transaction });
      }

      await transaction.commit();
      res.status(201).json({ data: incidencia, evidencia });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'residente') where.reportado_por = req.user.id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Incidencia no encontrada.' });
      const evidencias = await db.IncidenciasEvidencias.findAll({ where: { incidencia_id: row.id } });
      res.json({ data: row, evidencias });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}`, async (req, res, next) => {
    try {
      if (req.user.rol_codigo === 'residente') {
        return res.status(403).json({ error: 'El residente puede reportar y consultar; el cierre corresponde a guardia o administracion.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Incidencia no encontrada.' });
      const allowed = {};
      ['estado', 'prioridad', 'asignado_a', 'ubicacion'].forEach((k) => {
        if (req.body[k] !== undefined) allowed[k] = req.body[k];
      });
      if (allowed.estado === 'cerrada') {
        allowed.cerrada_por = req.user.id;
        allowed.fecha_resolucion = new Date();
      }
      const anterior = row.estado;
      await row.update(allowed);
      if (allowed.estado && allowed.estado !== anterior) {
        await db.IncidenciasSeguimiento.create({
          incidencia_id: row.id,
          usuario_id: req.user.id,
          comentario: req.body.comentario || null,
          estado_anterior: anterior,
          estado_nuevo: allowed.estado,
        });
      }
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.put(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
