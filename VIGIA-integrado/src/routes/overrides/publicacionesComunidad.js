'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const notificacionesService = require('../../services/notificacionesService');

// Incluye el nombre real del autor (requisito 3.3: no mostrar "Vecino"
// generico si el dato existe). Se limitan los atributos para no filtrar
// email/telefono/password_hash en una respuesta que puede leer
// cualquier residente del mismo residencial.
const AUTOR_INCLUDE = { model: db.Usuarios, as: 'usuario', attributes: ['id', 'nombre', 'apellido'] };

function validateContent(value) {
  const content = String(value || '').trim();
  if (!content || content.length > 500) return { error: 'Escribe un mensaje de hasta 500 caracteres.' };
  if ((content.match(/\n/g) || []).length > 3) return { error: 'La publicación admite un máximo de 4 líneas.' };
  if ((content.match(/https?:\/\//gi) || []).length > 2) return { error: 'La publicación admite un máximo de 2 enlaces.' };
  if (/(.)\1{12,}/.test(content)) return { error: 'Reduce las repeticiones antes de publicar.' };
  return { content };
}

module.exports = function publicacionesComunidadOverride({ router, model, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = req.user.rol_codigo === 'superadmin'
        ? { estado: 'publicada' }
        : { residencial_id: req.user.residencial_id, estado: 'publicada' };
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        where[Op.or] = [{ visibilidad: 'residencial' }, { usuario_id: req.user.id }];
      }
      const rows = await model.findAll({ where, include: [AUTOR_INCLUDE], order: [['fecha_creacion', 'DESC']], limit: 200 });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const checked = validateContent(req.body.contenido);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const categoria = req.body.categoria || 'General';
      const row = await model.create({
        residencial_id: req.user.residencial_id || req.body.residencial_id,
        usuario_id: req.user.id,
        categoria,
        contenido: checked.content,
        visibilidad: ['residencial', 'torre', 'administracion'].includes(req.body.visibilidad) ? req.body.visibilidad : 'residencial',
        bloque_torre: req.body.bloque_torre || null,
      });

      // Integracion con Notificaciones (requisito 5): un aviso publicado
      // por administracion/superadmin en la categoria "Aviso importante"
      // notifica a todos los residentes activos del residencial con un
      // titulo especial. El resto de publicaciones publicas del muro
      // (cualquier residente, cualquier categoria) tambien notifican al
      // resto de vecinos, pero con el mensaje generico "X subio un
      // mensaje en el muro de vecinos". Las publicaciones privadas
      // (visibilidad "administracion") no generan notificacion masiva.
      if (row.visibilidad === 'residencial' && row.residencial_id) {
        try {
          const esAvisoAdmin = ['admin', 'superadmin'].includes(req.user.rol_codigo) && categoria === 'Aviso importante';
          const autorNombre = (req.user.nombre_completo || '').trim() || 'Un vecino';
          await notificacionesService.crearParaResidencial({
            residencial_id: row.residencial_id,
            // Nunca se notifica al propio autor de la publicacion, sea
            // residente o administracion (requisito 3: "no llegue al
            // autor como una notificacion innecesaria").
            excluirUsuarioId: req.user.id,
            tipo: 'comunidad',
            titulo: esAvisoAdmin ? 'Nuevo aviso de administración' : `${autorNombre} subió un mensaje en el muro de vecinos`,
            mensaje: checked.content.slice(0, 140),
            referencia_tipo: 'publicacion',
            referencia_id: row.id,
          });
        } catch (notifyErr) { /* la publicacion ya se guardo; no se bloquea por un fallo al notificar */ }
      }

      const withAutor = await model.findOne({ where: { id: row.id }, include: [AUTOR_INCLUDE] });
      res.status(201).json({ data: withAutor || row, moderacion: { motor: 'reglas_locales', estado: 'permitido' } });
    } catch (err) { next(err); }
  });

  // Bandeja de reportadas para el panel de moderacion (requisito 3.8):
  // el generico ya devuelve estas publicaciones por estado, pero esta
  // ruta las trae ya unidas con el conteo de reportes pendientes.
  router.get('/reportadas', async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Solo administracion puede ver publicaciones reportadas.' });
      const where = req.user.rol_codigo === 'superadmin' ? {} : { residencial_id: req.user.residencial_id };
      const rows = await model.findAll({
        where,
        include: [AUTOR_INCLUDE, { model: db.PublicacionesReportes, as: 'publicaciones_reportes_publicacion_id' }],
        order: [['fecha_creacion', 'DESC']],
        limit: 200,
      });
      const reportadas = rows.filter((r) => (r.publicaciones_reportes_publicacion_id || []).length > 0);
      res.json({ data: reportadas });
    } catch (err) { next(err); }
  });

  async function findOwned(req) {
    const where = { id: req.params.id };
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    const row = await model.findOne({ where, include: [AUTOR_INCLUDE] });
    if (!row) return null;
    if (!['admin', 'superadmin'].includes(req.user.rol_codigo) && String(row.usuario_id) !== String(req.user.id)) return false;
    return row;
  }

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      const row = await findOwned(req);
      if (row === false) return res.status(403).json({ error: 'Esta publicación no te pertenece.' });
      if (!row) return res.status(404).json({ error: 'Publicación no encontrada.' });
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  const updateOwned = async (req, res, next) => {
    try {
      const row = await findOwned(req);
      if (row === false) return res.status(403).json({ error: 'Solo puedes editar tus publicaciones.' });
      if (!row) return res.status(404).json({ error: 'Publicación no encontrada.' });
      const patch = {};
      if (req.body.contenido !== undefined) {
        const checked = validateContent(req.body.contenido);
        if (checked.error) return res.status(400).json({ error: checked.error });
        patch.contenido = checked.content;
      }
      ['categoria', 'visibilidad', 'bloque_torre', 'estado'].forEach((key) => {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      });
      await row.update(patch);
      res.json({ data: row });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, updateOwned);
  router.patch(`/${pkPath}`, updateOwned);
  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      const row = await findOwned(req);
      if (row === false) return res.status(403).json({ error: 'Solo puedes eliminar tus publicaciones.' });
      if (!row) return res.status(404).json({ error: 'Publicación no encontrada.' });
      await row.update({ estado: 'eliminada' });
      res.json({ data: row });
    } catch (err) { next(err); }
  });
};
