'use strict';

// Reemplaza/extiende el CRUD generico de invitaciones para cubrir:
//   - Requisito 3/18: generar un codigo QR real al crear la invitacion
//     (unico uso, temporal o de evento; el "tipo" y "max_usos" ya vienen
//     en el body igual que en el CRUD generico).
//   - Requisito 19: si el body trae enviar_por=correo|whatsapp, manda la
//     invitacion por ese canal (o la simula si no hay credenciales, ver
//     src/services/envioService.js).
//   - Requisito 5: GET /validar/:codigo_qr, que usa el guardia antes de
//     dejar pasar a un visitante.
//
// El resto de verbos (list/getOne/update/remove) se dejan igual que el
// CRUD generico, reusando los handlers que ya trae la fabrica.

const qrService = require('../../services/qrService');
const envioService = require('../../services/envioService');
const invitacionesService = require('../../services/invitacionesService');
const { applyOwnershipOnCreate } = require('../../utils/crudFactory');

module.exports = function invitacionesOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});
      body.codigo_qr = qrService.generarCodigo();
      // el que crea la invitacion siempre es el residente logueado si
      // aplica; si la crea un admin/guardia a nombre de un residente,
      // debe venir residente_id explicito en el body.
      if (req.user && req.user.rol_codigo === 'residente' && !body.residente_id) {
        body.residente_id = req.user.id;
      }

      const invitacion = await model.create(body);
      const qrDataUrl = await qrService.generarImagenDataUrl(invitacion.codigo_qr);

      const envios = {};
      if (req.body.enviar_por === 'correo' && req.body.email_destino) {
        envios.correo = await envioService.enviarCorreo({
          para: req.body.email_destino,
          asunto: 'Invitacion de acceso - VIGIA',
          texto: `Te invitaron a ingresar. Tu codigo de acceso es: ${invitacion.codigo_qr}\nValido desde ${invitacion.fecha_valida_desde} hasta ${invitacion.fecha_valida_hasta}.`,
        });
      }
      if (req.body.enviar_por === 'whatsapp' && req.body.telefono_destino) {
        envios.whatsapp = await envioService.enviarWhatsapp({
          telefono: req.body.telefono_destino,
          mensaje: `Tu codigo de acceso VIGIA es: ${invitacion.codigo_qr}`,
        });
      }

      res.status(201).json({ data: invitacion, qr: qrDataUrl, envios });
    } catch (err) {
      next(err);
    }
  });

  // Requisito 5: validar antes de dejar pasar. No exige el permiso
  // "visitas.crear" (el guardia no crea invitaciones) sino que hereda el
  // acceso de lectura ya montado en routes/index.js para este recurso.
  router.get('/validar/:codigo_qr', async (req, res, next) => {
    try {
      const invitacion = await model.findOne({ where: { codigo_qr: req.params.codigo_qr } });
      const { valido, motivo } = invitacionesService.evaluarValidez(invitacion);

      if (!invitacion) return res.status(404).json({ valido, motivo });
      res.json({ valido, motivo, data: valido ? invitacion : undefined });
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
