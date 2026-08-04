'use strict';

const { Op } = require('sequelize');

module.exports = function contactosEmergenciaOverride({ router, model, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = req.user.rol_codigo === 'superadmin' ? { activo: true } : { residencial_id: req.user.residencial_id, activo: true };
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        where[Op.or] = [{ privado: false }, { usuario_id: req.user.id }];
      }
      const rows = await model.findAll({ where, order: [['orden_visual', 'ASC'], ['categoria', 'ASC']] });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const isAdmin = ['admin', 'superadmin'].includes(req.user.rol_codigo);
      const nombre = String(req.body.nombre || '').trim();
      const telefono = String(req.body.telefono || '').trim();
      if (!nombre || !telefono) return res.status(400).json({ error: 'Nombre y teléfono son requeridos.' });
      const row = await model.create({
        residencial_id: req.user.rol_codigo === 'superadmin' ? req.body.residencial_id : req.user.residencial_id,
        usuario_id: isAdmin && !req.body.privado ? null : req.user.id,
        categoria: req.body.categoria || 'familiar',
        nombre,
        telefono,
        telefono_alterno: req.body.telefono_alterno || null,
        disponible_24h: Boolean(req.body.disponible_24h),
        privado: isAdmin ? Boolean(req.body.privado) : true,
        orden_visual: Number(req.body.orden_visual || 0),
        activo: true,
      });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  async function owned(req) {
    const where = { id: req.params.id };
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    const row = await model.findOne({ where });
    if (!row) return null;
    if (!['admin', 'superadmin'].includes(req.user.rol_codigo) && String(row.usuario_id) !== String(req.user.id)) return false;
    return row;
  }

  router.get(`/${pkPath}`, async (req, res, next) => {
    try { const row = await owned(req); if (row === false) return res.status(403).json({ error: 'No puedes ver este contacto privado.' }); if (!row) return res.status(404).json({ error: 'Contacto no encontrado.' }); res.json({ data: row }); } catch (err) { next(err); }
  });
  const updateOwned = async (req, res, next) => {
    try {
      const row = await owned(req); if (row === false) return res.status(403).json({ error: 'Solo puedes editar tus contactos.' }); if (!row) return res.status(404).json({ error: 'Contacto no encontrado.' });
      const allowed = {}; ['categoria','nombre','telefono','telefono_alterno','disponible_24h','orden_visual','activo'].forEach(k=>{if(req.body[k]!==undefined)allowed[k]=req.body[k]});
      if (['admin','superadmin'].includes(req.user.rol_codigo) && req.body.privado !== undefined) allowed.privado = Boolean(req.body.privado);
      await row.update(allowed); res.json({ data: row });
    } catch (err) { next(err); }
  };
  router.patch(`/${pkPath}`, updateOwned);
  router.put(`/${pkPath}`, updateOwned);
  router.delete(`/${pkPath}`, async (req, res, next) => {
    try { const row = await owned(req); if (row === false) return res.status(403).json({ error: 'Solo puedes eliminar tus contactos.' }); if (!row) return res.status(404).json({ error: 'Contacto no encontrado.' }); await row.update({ activo: false }); res.json({ data: row }); } catch (err) { next(err); }
  });
};
