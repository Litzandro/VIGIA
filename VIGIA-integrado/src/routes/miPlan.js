'use strict';

// GET /api/mi-plan -- que incluye el plan de MI residencial (camaras,
// trancas, etc.) y el estado de mi suscripcion (para mostrarle al admin
// cuando le toca pagar). A proposito NO es lo mismo que /api/suscripciones
// (esa sigue siendo solo-superadmin, trae TODAS las residenciales y
// datos comerciales de todos los clientes) -- este endpoint es de
// cualquier usuario autenticado, pero solo ve la de su PROPIA
// residencial, y solo los campos que tiene sentido que vea (nada de
// notas internas de VIGIA sobre otros clientes).

const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { obtenerInfoPlan } = require('../utils/planAcceso');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (req.user.rol_codigo === 'superadmin') {
      return res.json({ data: null, mensaje: 'El superadmin no pertenece a una residencial -- usa /suscripciones para ver todos los clientes.' });
    }
    const info = await obtenerInfoPlan(req.user.residencial_id);
    res.json({ data: info });
  } catch (err) { next(err); }
});

module.exports = router;
