'use strict';

const crypto = require('crypto');

module.exports = function dispositivosUsuarioOverride({ router, model, pkPath }) {
  router.get('/me', async (req, res, next) => {
    try {
      const rows = await model.findAll({ where: { usuario_id: req.user.id }, order: [['ultimo_uso', 'DESC']] });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });
  router.post('/registrar', async (req, res, next) => {
    try {
      const identifier = String(req.body.identificador || crypto.randomUUID());
      const [row] = await model.findOrCreate({
        where: { usuario_id: req.user.id, identificador: identifier },
        defaults: {
          usuario_id: req.user.id,
          nombre: req.body.nombre || 'Dispositivo actual',
          identificador: identifier,
          plataforma: req.body.plataforma || null,
          biometria_disponible: Boolean(req.body.biometria_disponible),
          biometria_habilitada: false,
          confiable: Boolean(req.body.confiable),
          ultimo_uso: new Date(),
        },
      });
      await row.update({ ultimo_uso: new Date(), revocado: false });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });
  router.patch(`/${pkPath}/revocar`, async (req, res, next) => {
    try {
      const row = await model.findOne({ where: { id: req.params.id, usuario_id: req.user.id } });
      if (!row) return res.status(404).json({ error: 'Dispositivo no encontrado.' });
      await row.update({ revocado: true, confiable: false, biometria_habilitada: false });
      res.json({ data: row });
    } catch (err) { next(err); }
  });
  router.get('/', async (req, res) => res.json({ data: [] }));
};
