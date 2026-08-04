'use strict';

// Requisito 20: modo de llegada segura. Ademas del CRUD generico
// (crear/consultar/editar), agrega una accion de negocio propia:
// POST /:id/confirmar, que el residente usa para avisar "ya llegue" y
// cierra el seguimiento.

const { applyOwnershipOnCreate, primaryKeyWhere } = require('../../utils/crudFactory');

module.exports = function llegadasSegurasOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});
      if (req.user && req.user.rol_codigo === 'residente') {
        body.residente_id = req.user.id;
      }
      const llegada = await model.create(body);
      res.status(201).json({ data: llegada });
    } catch (err) {
      next(err);
    }
  });

  router.post(`/${pkPath}/confirmar`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      const llegada = await model.findOne({ where });
      if (!llegada) return res.status(404).json({ error: 'No encontrada' });
      await llegada.update({ estado: 'completada', fecha_fin: new Date() });
      res.json({ data: llegada, mensaje: 'Llegada confirmada' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
