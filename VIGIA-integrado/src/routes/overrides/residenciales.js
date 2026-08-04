'use strict';

const db = require('../../models');

module.exports = function residencialesOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = req.user.rol_codigo === 'superadmin'
        ? {}
        : { id: req.user.residencial_id };
      const rows = await model.findAll({ where, order: [['nombre', 'ASC']] });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (req.user.rol_codigo !== 'superadmin') {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo superadministración puede crear clientes residenciales.' });
      }
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El nombre de la residencial es requerido.' });
      }
      const row = await model.create({
        nombre,
        direccion: req.body.direccion || null,
        ciudad: req.body.ciudad || null,
        pais: req.body.pais || 'Honduras',
        telefono_contacto: req.body.telefono_contacto || null,
        email_contacto: req.body.email_contacto || null,
        zona_horaria: req.body.zona_horaria || 'America/Tegucigalpa',
        logo_url: req.body.logo_url || null,
        activo: true,
      }, { transaction });
      await db.ConfiguracionesResidencial.create({
        residencial_id: row.id,
        zona_horaria: row.zona_horaria,
        tiempo_objetivo_acceso_seg: 90,
        limite_cola_alerta: 5,
        tolerancia_turno_min: 15,
        tiempo_sesion_inactiva_min: 30,
      }, { transaction });
      await db.PuntosAcceso.create({ residencial_id: row.id, nombre: 'Garita principal', tipo: 'mixto', activo: true }, { transaction });
      const plan = await db.PlanesServicio.findOne({ where: { codigo: 'esencial', activo: true }, transaction });
      if (plan) {
        const start = new Date();
        const trialEnd = new Date(start); trialEnd.setDate(trialEnd.getDate() + 15);
        await db.Suscripciones.create({
          residencial_id: row.id,
          plan_id: plan.id,
          estado: 'prueba',
          fecha_inicio: start,
          fecha_fin_prueba: trialEnd,
          ciclo: 'mensual',
          precio_acordado: plan.precio_mensual,
          notas: 'Prueba inicial creada automáticamente.',
        }, { transaction });
      }
      await transaction.commit();
      res.status(201).json({ data: row, mensaje: 'Residencial creada con garita, configuración y prueba inicial.' });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      if (req.user.rol_codigo !== 'superadmin' && String(req.params.id) !== String(req.user.residencial_id)) return res.status(403).json({ error: 'No puedes consultar otra residencial.' });
      return handlers.getOne(req, res, next);
    } catch (err) { next(err); }
  });
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
