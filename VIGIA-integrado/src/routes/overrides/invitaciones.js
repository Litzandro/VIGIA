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
const { normalizarTelefonoHN } = require('../../utils/telefonoHN');
const { validarCampos } = require('../../config/resourceValidation');

module.exports = function invitacionesOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const body = applyOwnershipOnCreate(model, req.user, req.body || {});
      const errores = validarCampos(model, body);
      if (errores.length) {
        return res.status(400).json({ error: 'Datos invalidos', detalles: errores });
      }
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
        // Sin el +504 el enlace de WhatsApp que arma envioService.js
        // (wa.me/<numero>) queda con solo 8 digitos y no abre ningun
        // chat real -- necesita el numero completo con codigo de pais.
        envios.whatsapp = await envioService.enviarWhatsapp({
          telefono: normalizarTelefonoHN(req.body.telefono_destino),
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
  //
  // Antes esto buscaba el codigo_qr en TODA la tabla, sin importar la
  // residencial de quien pregunta -- en la practica es casi imposible
  // de explotar (codigo_qr es un UUID al azar, nadie va a adivinar el
  // de otra residencial), pero igual no hay razon para que un guardia
  // de la residencial A pueda confirmar detalles de una visita de la
  // residencial B si por algun motivo llegara a escribir/escanear ese
  // codigo. superadmin si puede validar de cualquier residencial.
  router.get('/validar/:codigo_qr', async (req, res, next) => {
    try {
      const where = { codigo_qr: req.params.codigo_qr };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const invitacion = await model.findOne({ where });
      const { valido, motivo } = invitacionesService.evaluarValidez(invitacion);

      if (!invitacion) return res.status(404).json({ valido, motivo });
      res.json({ valido, motivo, data: valido ? invitacion : undefined });
    } catch (err) {
      next(err);
    }
  });

  // La imagen del QR no se guarda en la base -- codigo_qr (el UUID) si
  // se guarda, y qrService.generarImagenDataUrl() siempre produce la
  // MISMA imagen para el mismo texto, asi que no hace falta guardar el
  // PNG aparte. Esto es lo que deja al residente volver a ver/compartir
  // el QR de una invitacion ya creada, no solo en el momento en que la
  // creo (que es la unica vez que el POST de arriba lo devuelve).
  router.get('/:id/qr', async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const invitacion = await model.findOne({ where });
      if (!invitacion) return res.status(404).json({ error: 'Invitación no encontrada.' });
      if (req.user.rol_codigo === 'residente' && String(invitacion.residente_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Esa invitación no te pertenece.' });
      }
      const qr = await qrService.generarImagenDataUrl(invitacion.codigo_qr);
      res.json({ qr });
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
