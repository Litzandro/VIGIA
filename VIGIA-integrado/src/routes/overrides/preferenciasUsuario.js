'use strict';

module.exports = function preferenciasUsuarioOverride({ router, model }) {
  router.get('/me', async (req, res, next) => {
    try {
      const [row] = await model.findOrCreate({ where: { usuario_id: req.user.id }, defaults: { usuario_id: req.user.id } });
      res.json({ data: row });
    } catch (err) { next(err); }
  });
  router.put('/me', async (req, res, next) => {
    try {
      const [row] = await model.findOrCreate({ where: { usuario_id: req.user.id }, defaults: { usuario_id: req.user.id } });
      const allowed = {};
      ['tema', 'filtro_color', 'tamano_texto', 'modo_simple', 'lectura_asistida', 'reducir_movimiento', 'biometria_preferida'].forEach((k) => {
        if (req.body[k] !== undefined) allowed[k] = req.body[k];
      });
      await row.update(allowed);
      res.json({ data: row });
    } catch (err) { next(err); }
  });
  router.get('/', async (req, res) => res.json({ data: [] }));
  router.post('/', async (req, res) => res.status(405).json({ error: 'Usa /api/preferencias-usuario/me.' }));
};
