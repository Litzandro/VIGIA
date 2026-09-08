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
    const transaction = await db.sequelize.transaction();
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});

      if (req.user && req.user.rol_codigo === 'guardia') {
        body.guardia_id = req.user.id;
      }

      let invitacion = null;
      if (body.invitacion_id) {
        // Bug real de condicion de carrera: antes esto leia la
        // invitacion, la validaba, y RECIEN DESPUES descontaba el uso
        // -- sin nada que impidiera que dos peticiones casi simultaneas
        // (dos guardias escaneando el mismo QR en garitas distintas al
        // mismo tiempo, o un reintento de red duplicando la peticion)
        // leyeran las dos "todavia tiene usos disponibles" ANTES de que
        // cualquiera de las dos alcanzara a descontarlo. Resultado
        // posible: un codigo de un solo uso dejaba entrar a mas
        // personas de las permitidas.
        //
        // "lock: transaction.LOCK.UPDATE" (SELECT ... FOR UPDATE en
        // MySQL/InnoDB) bloquea esa fila hasta que esta transaccion
        // termine -- una segunda peticion que llegue al mismo tiempo
        // tiene que esperar a que la primera commitee, y cuando por fin
        // lee la invitacion, ya ve el uso ya descontado y la rechaza
        // correctamente. SQLite (usado solo para pruebas locales, nunca
        // en produccion) ignora esta opcion sin fallar.
        invitacion = await db.Invitaciones.findByPk(body.invitacion_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const { valido, motivo } = invitacionesService.evaluarValidez(invitacion);
        if (!valido) {
          await transaction.rollback();
          return res.status(409).json({ error: `Invitacion no valida: ${motivo}` });
        }
      }

      const acceso = await model.create(body, { transaction });

      if (invitacion) {
        const nuevosUsos = invitacion.usos_actuales + 1;
        await invitacion.update({
          usos_actuales: nuevosUsos,
          estado: nuevosUsos >= invitacion.max_usos ? 'usada' : invitacion.estado,
        }, { transaction });
      }

      await transaction.commit();

      if (invitacion) {
        // Requisito 9 -- la notificacion se manda DESPUES de que la
        // transaccion ya quedo confirmada (no adentro de ella): si el
        // envio de la notificacion fallara por cualquier motivo, no
        // tiene sentido deshacer el acceso ya registrado ni el uso ya
        // descontado, que son los datos que de verdad importan.
        try {
          await notificacionesService.crear({
            usuario_id: invitacion.residente_id,
            tipo: 'ingreso_visita',
            titulo: acceso.tipo_movimiento === 'entrada' ? 'Tu visita ingreso' : 'Tu visita salio',
            mensaje: `Se registro un(a) ${acceso.tipo_movimiento} de tu invitacion el ${new Date(acceso.fecha_hora).toLocaleString()}.`,
            referencia_tipo: 'accesos',
            referencia_id: acceso.id,
          });
        } catch (errNotif) {
          console.error('[VIGIA] No se pudo notificar el acceso de la invitacion', invitacion.id, errNotif.message);
        }
      }

      res.status(201).json({ data: acceso });
    } catch (err) {
      // Si el error ocurrio DESPUES de un commit exitoso (ej. fallo el
      // envio de la notificacion, aunque eso ya tiene su propio
      // try/catch arriba), la transaccion ya esta cerrada -- intentar
      // un rollback sobre una transaccion terminada lanza un segundo
      // error ("Transaction cannot be rolled back because it has been
      // finished") que taparia el error real. finished==='commit'
      // indica justamente ese caso, asi que se evita el doble intento.
      if (transaction.finished !== 'commit') {
        await transaction.rollback().catch(() => {});
      }
      next(err);
    }
  });

  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
