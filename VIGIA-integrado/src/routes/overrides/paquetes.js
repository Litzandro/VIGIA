'use strict';

// Flujo de paqueteria con privacidad por vivienda y notificaciones.
// Reutiliza la tabla paquetes existente; no requiere migraciones.

const { Op } = require('sequelize');
const db = require('../../models');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const notificacionesService = require('../../services/notificacionesService');

async function residentHome(userId) {
  return db.Residentes.findOne({ where: { usuario_id: userId } });
}

async function notifyHome(viviendaId, payload) {
  const residents = await db.Residentes.findAll({ where: { vivienda_id: viviendaId }, attributes: ['usuario_id'] });
  await Promise.all(residents.map((r) => notificacionesService.crearParaUsuario({ usuario_id: r.usuario_id, ...payload })));
}

module.exports = function paquetesOverride({ router, model, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'residente') {
        const resident = await residentHome(req.user.id);
        if (!resident) return res.json({ data: [], meta: { total: 0 } });
        where.vivienda_id = resident.vivienda_id;
      }
      if (req.query.estado && ['pendiente', 'entregado', 'devuelto'].includes(req.query.estado)) where.estado = req.query.estado;
      const rows = await model.findAll({ where, order: [['fecha_recepcion', 'DESC']], limit: 200 });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      if (req.user.rol_codigo === 'residente') return res.status(403).json({ error: 'La recepción de paquetes corresponde a garita o administración.' });
      const viviendaId = Number(req.body.vivienda_id);
      if (!Number.isInteger(viviendaId) || viviendaId <= 0) return res.status(400).json({ error: 'Selecciona una vivienda válida.' });
      const viviendaWhere = { id: viviendaId };
      if (req.user.rol_codigo !== 'superadmin') viviendaWhere.residencial_id = req.user.residencial_id;
      const vivienda = await db.Viviendas.findOne({ where: viviendaWhere });
      if (!vivienda) return res.status(404).json({ error: 'La vivienda no pertenece a esta residencial.' });

      const row = await model.create({
        residencial_id: vivienda.residencial_id,
        vivienda_id: vivienda.id,
        recibido_por: req.user.id,
        descripcion: String(req.body.descripcion || '').trim().slice(0, 255) || null,
        empresa_envio: String(req.body.empresa_envio || '').trim().slice(0, 100) || null,
        estado: 'pendiente',
      });

      try {
        await notifyHome(vivienda.id, {
          tipo: 'paquete',
          titulo: 'Tienes un paquete en garita',
          mensaje: `${row.empresa_envio || 'Paquetería'}${row.descripcion ? ` · ${row.descripcion}` : ''}`,
          referencia_tipo: 'paquetes',
          referencia_id: row.id,
        });
      } catch (e) { /* no se revierte la recepción por fallo de notificación */ }
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'residente') {
        const resident = await residentHome(req.user.id);
        if (!resident) return res.status(404).json({ error: 'Paquete no encontrado.' });
        where.vivienda_id = resident.vivienda_id;
      }
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Paquete no encontrado.' });
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}`, async (req, res, next) => {
    try {
      if (req.user.rol_codigo === 'residente') return res.status(403).json({ error: 'La entrega la confirma garita o administración.' });
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Paquete no encontrado.' });
      const nextState = String(req.body.estado || '');
      if (!['pendiente', 'entregado', 'devuelto'].includes(nextState)) return res.status(400).json({ error: 'Estado de paquete inválido.' });
      const patch = { estado: nextState };
      if (nextState === 'entregado') {
        patch.entregado_a = req.body.entregado_a || req.user.id;
        patch.fecha_entrega = new Date();
      }
      await row.update(patch);
      try {
        await notifyHome(row.vivienda_id, {
          tipo: 'paquete',
          titulo: nextState === 'entregado' ? 'Paquete entregado' : nextState === 'devuelto' ? 'Paquete devuelto' : 'Estado de paquete actualizado',
          mensaje: row.descripcion || row.empresa_envio || 'Paquete registrado en VIGIA',
          referencia_tipo: 'paquetes',
          referencia_id: row.id,
        });
      } catch (e) {}
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.put(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Usa PATCH para actualizar el estado del paquete.' }));
  router.delete(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los paquetes se conservan como historial de seguridad.' }));
};
