'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const notificacionesService = require('../../services/notificacionesService');

const ESTADO_LABEL = {
  reportada: 'fue registrada',
  en_revision: 'está ahora en revisión',
  en_progreso: 'está ahora en progreso',
  resuelta: 'fue resuelta',
  cerrada: 'fue cerrada',
};

function folio(incidencia) {
  return `#INC-${String(incidencia.id).padStart(4, '0')}`;
}

function normalizePriority(value) {
  const map = { baja: 'baja', media: 'media', alta: 'alta', urgente: 'urgente' };
  return map[String(value || '').toLowerCase()] || 'media';
}

module.exports = function incidenciasOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      // Privacidad (corregida): un residente ve sus propias incidencias
      // (privadas o no) y ademas las de visibilidad "comunidad" de su
      // mismo residencial (antes solo veia las suyas, por lo que una
      // notificacion de una incidencia publica de otro vecino llevaba a
      // un 404). Nunca ve privadas/administracion de otros residentes,
      // ni nada de otro residencial (eso ya lo filtra residencial_id).
      const andConditions = [];
      if (req.user.rol_codigo === 'residente') {
        andConditions.push({ [Op.or]: [{ reportado_por: req.user.id }, { visibilidad: 'comunidad' }] });
      }
      if (req.query.estado && model.rawAttributes.estado) where.estado = req.query.estado;
      if (req.query.prioridad && model.rawAttributes.prioridad) where.prioridad = req.query.prioridad;
      if (req.query.q) {
        andConditions.push({
          [Op.or]: [
            { titulo: { [Op.like]: `%${req.query.q}%` } },
            { descripcion: { [Op.like]: `%${req.query.q}%` } },
          ],
        });
      }
      if (andConditions.length) where[Op.and] = andConditions;
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

      // Integracion con Notificaciones (requisito 5): el residente que
      // reporta se entera de inmediato de que quedo registrada, sin
      // depender de recargar la pagina.
      try {
        await notificacionesService.crear({
          usuario_id: incidencia.reportado_por,
          tipo: 'incidencia',
          titulo: `Tu incidencia ${folio(incidencia)} fue registrada`,
          mensaje: titulo,
          referencia_tipo: 'incidencia',
          referencia_id: incidencia.id,
        });
      } catch (notifyErr) { /* la incidencia ya quedo guardada; no se bloquea por un fallo al notificar */ }

      // Si la incidencia es publica (visibilidad "comunidad"), el resto
      // de los residentes tambien debe enterarse, no solo quien la
      // reporto (se pidio explicitamente: "si una incidencia es publica
      // deberia aparecer en notificaciones").
      if (incidencia.visibilidad === 'comunidad' && incidencia.residencial_id) {
        try {
          await notificacionesService.crearParaResidencial({
            residencial_id: incidencia.residencial_id,
            excluirUsuarioId: incidencia.reportado_por,
            tipo: 'incidencia',
            titulo: `Nueva incidencia pública ${folio(incidencia)}`,
            mensaje: titulo,
            referencia_tipo: 'incidencia',
            referencia_id: incidencia.id,
          });
        } catch (notifyErr) { /* idem: no se bloquea la respuesta por un fallo al notificar */ }
      }

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
      // Misma correccion que en el listado: propias o publicas del
      // mismo residencial, nunca privadas/administracion de otro vecino.
      if (req.user.rol_codigo === 'residente') where[Op.or] = [{ reportado_por: req.user.id }, { visibilidad: 'comunidad' }];
      const row = await model.findOne({
        where,
        include: [
          { model: db.TiposIncidencia, as: 'tipoIncidencia' },
          { model: db.Usuarios, as: 'reportadoPor', attributes: ['id', 'nombre', 'apellido'] },
          { model: db.Usuarios, as: 'asignadoA', attributes: ['id', 'nombre', 'apellido'] },
        ],
      });
      if (!row) return res.status(404).json({ error: 'Incidencia no encontrada.' });
      const [evidencias, seguimiento] = await Promise.all([
        db.IncidenciasEvidencias.findAll({ where: { incidencia_id: row.id } }),
        db.IncidenciasSeguimiento.findAll({
          where: { incidencia_id: row.id },
          include: [{ model: db.Usuarios, as: 'usuario', attributes: ['id', 'nombre', 'apellido'] }],
          order: [['fecha_hora', 'ASC']],
        }),
      ]);
      res.json({ data: row, evidencias, seguimiento });
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
        // El residente que reporto se entera del avance sin tener que
        // volver a entrar a consultar (requisito 5, integracion entre
        // modulos).
        try {
          await notificacionesService.crear({
            usuario_id: row.reportado_por,
            tipo: 'incidencia',
            titulo: `Tu incidencia ${folio(row)} ${ESTADO_LABEL[allowed.estado] || 'cambió de estado'}`,
            mensaje: row.titulo,
            referencia_tipo: 'incidencia',
            referencia_id: row.id,
          });
        } catch (notifyErr) { /* el estado ya se guardo; no se bloquea por un fallo al notificar */ }

        // Si es publica, el avance tambien se avisa al resto de vecinos.
        if (row.visibilidad === 'comunidad' && row.residencial_id) {
          try {
            await notificacionesService.crearParaResidencial({
              residencial_id: row.residencial_id,
              excluirUsuarioId: row.reportado_por,
              tipo: 'incidencia',
              titulo: `Incidencia pública ${folio(row)} ${ESTADO_LABEL[allowed.estado] || 'cambió de estado'}`,
              mensaje: row.titulo,
              referencia_tipo: 'incidencia',
              referencia_id: row.id,
            });
          } catch (notifyErr) { /* idem */ }
        }
      }
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.put(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
