'use strict';

const db = require('../../models');
const { Op } = require('sequelize');

async function decorate(rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.guardia_original_id, r.guardia_relevo_id]).filter(Boolean))];
  const users = ids.length ? await db.Usuarios.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nombre', 'apellido'] }) : [];
  const names = new Map(users.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  return rows.map((r) => {
    const data = r.toJSON();
    data.guardia_original_nombre = names.get(String(r.guardia_original_id)) || `Guardia #${r.guardia_original_id}`;
    data.guardia_relevo_nombre = r.guardia_relevo_id ? (names.get(String(r.guardia_relevo_id)) || `Guardia #${r.guardia_relevo_id}`) : null;
    return data;
  });
}

module.exports = function turnosGuardiaOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'guardia') {
        where[Op.or] = [{ guardia_original_id: req.user.id }, { guardia_relevo_id: req.user.id }];
      }
      if (req.query.estado) where.estado = req.query.estado;
      const rows = await model.findAll({ where, order: [['inicio_programado', 'DESC']], limit: 200 });
      res.json({ data: await decorate(rows), meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Solo administración programa jornadas.' });
      const start = new Date(req.body.inicio_programado);
      const end = new Date(req.body.fin_programado);
      if (!req.body.guardia_original_id || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ error: 'Selecciona guardia y un horario válido.' });
      }
      const row = await model.create({
        residencial_id: req.user.rol_codigo === 'superadmin' ? req.body.residencial_id : req.user.residencial_id,
        punto_acceso_id: req.body.punto_acceso_id || null,
        guardia_original_id: req.body.guardia_original_id,
        guardia_relevo_id: req.body.guardia_relevo_id || null,
        inicio_programado: start,
        fin_programado: end,
        estado: req.body.estado || 'programado',
        observaciones: req.body.observaciones || null,
      });
      res.status(201).json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}/accion`, async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Turno no encontrado.' });
      const action = req.body.accion;
      const patch = {};
      if (action === 'iniciar') {
        if (req.user.rol_codigo === 'guardia' && ![row.guardia_original_id, row.guardia_relevo_id].map(String).includes(String(req.user.id))) return res.status(403).json({ error: 'Este turno no te corresponde.' });
        patch.estado = 'activo'; patch.inicio_real = new Date();
      } else if (action === 'relevar') {
        if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Solo administración registra relevos.' });
        if (!req.body.guardia_relevo_id) return res.status(400).json({ error: 'Selecciona el guardia de relevo.' });
        patch.estado = 'relevado'; patch.guardia_relevo_id = req.body.guardia_relevo_id;
        patch.observaciones = req.body.observaciones || row.observaciones;
      } else if (action === 'finalizar') {
        if (req.user.rol_codigo === 'guardia' && ![row.guardia_original_id, row.guardia_relevo_id].map(String).includes(String(req.user.id))) return res.status(403).json({ error: 'Este turno no te corresponde.' });
        patch.estado = 'finalizado'; patch.fin_real = new Date();
      } else return res.status(400).json({ error: 'Acción inválida.' });
      await row.update(patch);
      res.json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, handlers.getOne);
  const adminUpdate = async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Solo administración edita jornadas directamente.' });
      const where = { id: req.params.id };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Turno no encontrado.' });
      const allowed = {};
      ['punto_acceso_id','guardia_original_id','guardia_relevo_id','inicio_programado','fin_programado','estado','observaciones'].forEach(k=>{if(req.body[k]!==undefined)allowed[k]=req.body[k]});
      await row.update(allowed);
      res.json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, adminUpdate);
  router.patch(`/${pkPath}`, adminUpdate);
  router.delete(`/${pkPath}`, handlers.remove);
};
