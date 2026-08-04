'use strict';

const db = require('../../models');
const { primaryKeyWhere } = require('../../utils/crudFactory');

module.exports = function integracionesOverride({ router, model, handlers, pkPath }) {
  router.post(`/${pkPath}/probar`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const integration = await model.findOne({ where });
      if (!integration) return res.status(404).json({ error: 'Integracion no encontrada.' });
      // Por seguridad no se hacen peticiones a endpoints arbitrarios desde
      // este prototipo. Se registra un evento simulado listo para sustituir
      // por un adaptador certificado del proveedor.
      const event = await db.EventosIntegracion.create({
        integracion_id: integration.id,
        usuario_id: req.user.id,
        accion: req.body.accion || 'prueba_conexion',
        estado: integration.modo === 'produccion' ? 'pendiente' : 'simulado',
        solicitud_json: req.body || {},
        respuesta_json: {
          mensaje: integration.modo === 'produccion'
            ? 'Adaptador pendiente de configurar con credenciales del proveedor.'
            : 'Simulacion completada sin activar hardware real.',
        },
      });
      await integration.update({ ultima_sincronizacion: new Date(), estado: integration.modo === 'simulador' ? 'activa' : integration.estado });
      res.json({ data: event, integracion: integration });
    } catch (err) { next(err); }
  });
  router.get('/', handlers.list);
  router.post('/', handlers.create);
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
