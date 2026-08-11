'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');

module.exports = function vetosAccesoOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'residente') where.solicitado_por = req.user.id;
      if (req.query.estado) where.estado = req.query.estado;
      const rows = await model.findAll({ where, order: [['fecha_creacion', 'DESC']], limit: 200 });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const nombre = String(req.body.nombre_persona || '').trim();
      const motivo = String(req.body.motivo || '').trim();
      if (!nombre || !motivo) return res.status(400).json({ error: 'Nombre y motivo son requeridos.' });
      const alcance = req.user.rol_codigo === 'residente' ? 'vivienda' : (req.body.alcance || 'residencial');
      const estado = ['admin', 'superadmin'].includes(req.user.rol_codigo) ? (req.body.estado || 'activo') : 'pendiente';
      const row = await model.create({
        residencial_id: req.user.residencial_id || req.body.residencial_id,
        solicitado_por: req.user.id,
        aprobado_por: estado === 'activo' ? req.user.id : null,
        visitante_id: req.body.visitante_id || null,
        nombre_persona: nombre,
        tipo_documento: req.body.tipo_documento || null,
        numero_documento: req.body.numero_documento || null,
        telefono: req.body.telefono || null,
        alcance,
        motivo,
        evidencia_url: req.body.evidencia_url || null,
        estado,
        fecha_desde: estado === 'activo' ? new Date() : null,
        fecha_hasta: req.body.fecha_hasta || null,
        fecha_resolucion: estado === 'activo' ? new Date() : null,
      });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}/resolver`, async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo administracion puede aprobar, rechazar o revocar vetos.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where, transaction });
      if (!row) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Veto no encontrado.' });
      }
      const estado = req.body.estado;
      if (!['activo', 'rechazado', 'revocado'].includes(estado)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Estado de resolucion invalido.' });
      }
      await row.update({
        estado,
        aprobado_por: req.user.id,
        fecha_desde: estado === 'activo' ? (row.fecha_desde || new Date()) : row.fecha_desde,
        fecha_resolucion: new Date(),
      }, { transaction });

      let conflicto = null;
      if (estado === 'activo' && row.numero_documento) {
        const autorizado = await db.PersonasAutorizadas.findOne({
          where: {
            residencial_id: row.residencial_id,
            numero_documento: row.numero_documento,
            estado: { [Op.in]: ['pendiente', 'activa'] },
          },
          transaction,
        });
        if (autorizado) {
          conflicto = await db.ConflictosPermisos.create({
            residencial_id: row.residencial_id,
            persona_autorizada_id: autorizado.id,
            veto_id: row.id,
            nombre_persona: row.nombre_persona,
            numero_documento: row.numero_documento,
            descripcion: 'La persona tiene una autorizacion recurrente y un veto activo.',
            detectado_por: req.user.id,
          }, { transaction });
        }
      }
      await transaction.commit();
      res.json({ data: row, conflicto });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);

  // La tabla no tiene columna de borrado logico (activo), asi que el
  // DELETE generico haria un destroy() fisico y se perderia el registro
  // de que alguien estuvo vetado (importante para auditoria/evidencia).
  // Nadie en la interfaz llama a este endpoint hoy, pero lo dejamos
  // seguro por si se usa directo contra la API: revoca en vez de borrar.
  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        return res.status(403).json({ error: 'Solo administracion puede revocar un veto.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Veto no encontrado.' });
      await row.update({ estado: 'revocado', aprobado_por: req.user.id, fecha_resolucion: new Date() });
      res.json({ data: row, mensaje: 'Veto revocado. Se conserva el historial.' });
    } catch (err) { next(err); }
  });
};
