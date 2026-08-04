'use strict';

const { Op } = require('sequelize');

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
      const rows = await model.findAll({ where, order: [['fecha_creacion', 'DESC']], limit: 200 });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const checked = validateContent(req.body.contenido);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const row = await model.create({
        residencial_id: req.user.residencial_id || req.body.residencial_id,
        usuario_id: req.user.id,
        categoria: req.body.categoria || 'General',
        contenido: checked.content,
        visibilidad: ['residencial', 'torre', 'administracion'].includes(req.body.visibilidad) ? req.body.visibilidad : 'residencial',
        bloque_torre: req.body.bloque_torre || null,
      });
      res.status(201).json({ data: row, moderacion: { motor: 'reglas_locales', estado: 'permitido' } });
    } catch (err) { next(err); }
  });

  async function findOwned(req) {
    const where = { id: req.params.id };
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    const row = await model.findOne({ where });
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
