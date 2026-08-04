'use strict';

// Extiende el CRUD generico de accesos para cubrir:
//   - Requisito 5: si el acceso trae invitacion_id, valida que la
//     invitacion todavia tenga usos disponibles antes de registrar el
//     movimiento, y le descuenta un uso.
//   - Requisito 9: si el acceso viene de una invitacion, notifica al
//     residente anfitrion que su visita entro/salio.
//   - El guardia logueado queda registrado solo como quien hizo el
//     movimiento (no se confia en que el cliente mande el guardia_id
//     correcto).

const db = require('../../models');
const notificacionesService = require('../../services/notificacionesService');
const invitacionesService = require('../../services/invitacionesService');
const { applyOwnershipOnCreate } = require('../../utils/crudFactory');

module.exports = function accesosOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});

      if (req.user && req.user.rol_codigo === 'guardia') {
        body.guardia_id = req.user.id;
      }

      let invitacion = null;
      if (body.invitacion_id) {
        invitacion = await db.Invitaciones.findByPk(body.invitacion_id);
        const { valido, motivo } = invitacionesService.evaluarValidez(invitacion);
        if (!valido) {
          return res.status(409).json({ error: `Invitacion no valida: ${motivo}` });
        }
      }

      const acceso = await model.create(body);

      if (invitacion) {
        const nuevosUsos = invitacion.usos_actuales + 1;
        await invitacion.update({
          usos_actuales: nuevosUsos,
          estado: nuevosUsos >= invitacion.max_usos ? 'usada' : invitacion.estado,
        });

        // Requisito 9
        await notificacionesService.crear({
          usuario_id: invitacion.residente_id,
          tipo: 'ingreso_visita',
          titulo: acceso.tipo_movimiento === 'entrada' ? 'Tu visita ingreso' : 'Tu visita salio',
          mensaje: `Se registro un(a) ${acceso.tipo_movimiento} de tu invitacion el ${new Date(acceso.fecha_hora).toLocaleString()}.`,
          referencia_tipo: 'accesos',
          referencia_id: acceso.id,
        });
      }

      res.status(201).json({ data: acceso });
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
