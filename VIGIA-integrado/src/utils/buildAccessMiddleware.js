'use strict';

const { requireAuth, requireRole, requirePermission, blocked } = require('../middlewares/auth');

// Traduce una regla de src/config/resourcePermissions.js (o el default
// "solo estar logueado" cuando la tabla no aparece ahi) en la cadena de
// middlewares de Express que hay que poner antes del handler real.
function buildAccessMiddleware(rule) {
  if (rule === 'blocked') return [blocked];
  if (!rule) return [requireAuth];
  if (rule.permission) return [requireAuth, requirePermission(rule.permission)];
  if (rule.roles) return [requireAuth, requireRole(...rule.roles)];
  return [requireAuth];
}

module.exports = { buildAccessMiddleware };
