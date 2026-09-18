'use strict';

// Modo de llegada segura. El residente inicia un seguimiento con ETA y
// garita recibe una notificación; solo el dueño de la llegada puede
// confirmarla directamente. Reutiliza la tabla existente.

const { applyOwnershipOnCreate, applyOwnershipScope, primaryKeyWhere } = require('../../utils/crudFactory');
const notificacionesService = require('../../services/notificacionesService');

module.exports = function llegadasSegurasOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});
      if (req.user && req.user.rol_codigo === 'residente') body.residente_id = req.user.id;
      body.estado = 'en_curso';
      const llegada = await model.create(body);

      if (req.user && req.user.residencial_id) {
        try {
          await notificacionesService.crearParaResidencial({
            residencial_id: req.user.residencial_id,
            excluirUsuarioId: req.user.id,
            soloRoles: ['guardia', 'admin'],
            tipo: 'llegada_segura',
            titulo: 'Residente en camino',
            mensaje: `${req.user.nombre_completo || 'Un residente'} indicó que llegará aproximadamente a las ${new Date(llegada.hora_estimada_llegada).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}.`,
            referencia_tipo: 'llegadas_seguras',
            referencia_id: llegada.id,
          });
        } catch (e) { /* el seguimiento no falla por una notificación */ }
      }

      res.status(201).json({ data: llegada });
    } catch (err) {
      next(err);
    }
  });

  router.post(`/${pkPath}/confirmar`, async (req, res, next) => {
    try {
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const llegada = await model.findOne({ where });
      if (!llegada) return res.status(404).json({ error: 'Llegada segura no encontrada.' });
      if (llegada.estado !== 'en_curso') return res.status(409).json({ error: 'Esta llegada ya no está en curso.' });
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
