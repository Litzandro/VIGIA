'use strict';

// Requisito 8: boton de panico/SOS. Al crear una alerta, notifica de
// inmediato a todos los guardias y administradores activos de la misma
// residencial (no hay push/websocket en este entregable: la
// "inmediatez" hoy es una fila en notificaciones que el frontend puede
// pollear o el guardia ve al entrar al panel; conectar push queda
// como mejora futura, ver README).

const db = require('../../models');
const notificacionesService = require('../../services/notificacionesService');

module.exports = function alertasPanicoOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });

      const body = {
        ...req.body,
        usuario_id: req.user.id,
        residencial_id: req.user.rol_codigo === 'superadmin' ? req.body.residencial_id : req.user.residencial_id,
      };

      const alerta = await model.create(body);

      const destinatarios = await db.Usuarios.findAll({
        where: { residencial_id: alerta.residencial_id, estado: 'activo' },
        include: [{ model: db.Roles, as: 'rol', where: { codigo: ['guardia', 'admin'] } }],
      });

      await Promise.all(
        destinatarios.map((destinatario) =>
          notificacionesService.crear({
            usuario_id: destinatario.id,
            tipo: 'alerta',
            titulo: 'Alerta de panico activada',
            mensaje: 'Se activo una alerta de panico/SOS en la residencial. Revisar de inmediato.',
            referencia_tipo: 'alertas_panico',
            referencia_id: alerta.id,
          })
        )
      );

      res.status(201).json({ data: alerta, notificados: destinatarios.length });
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
