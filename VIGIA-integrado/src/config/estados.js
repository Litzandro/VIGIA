'use strict';

// Fuente unica de verdad para valores de estado y reglas de rol que antes
// estaban repetidos como strings sueltos ("numeros magicos" de texto) en
// varios overrides (turnosGuardia.js, alertasPanico.js, vetosAcceso.js,
// conflictosPermisos.js). Centralizarlos aca permite:
//   1) Que un typo ("progrmado") falle al escribir codigo (autocompletado /
//      referencia a la constante) en vez de fallar en produccion.
//   2) Que agregar un estado nuevo, o cambiar quien cuenta como "admin",
//      se haga en un solo lugar en vez de perseguir el string por todo
//      el proyecto.

const TURNO_ESTADO = Object.freeze({
  PROGRAMADO: 'programado',
  ACTIVO: 'activo',
  RELEVADO: 'relevado',
  FINALIZADO: 'finalizado',
  AUSENTE: 'ausente',
});

const TURNO_ACCION = Object.freeze({
  INICIAR: 'iniciar',
  RELEVAR: 'relevar',
  FINALIZAR: 'finalizar',
});

const VETO_ESTADO = Object.freeze({
  PENDIENTE: 'pendiente',
  ACTIVO: 'activo',
  RECHAZADO: 'rechazado',
  REVOCADO: 'revocado',
});

const VETO_ALCANCE = Object.freeze({
  VIVIENDA: 'vivienda',
  RESIDENCIAL: 'residencial',
});

const CONFLICTO_ESTADO = Object.freeze({
  ABIERTO: 'abierto',
  EN_REVISION: 'en_revision',
  RESUELTO_AUTORIZAR: 'resuelto_autorizar',
  RESUELTO_BLOQUEAR: 'resuelto_bloquear',
  CERRADO: 'cerrado',
});

// Roles que administran la residencial. Antes aparecia como
// ['admin', 'superadmin'].includes(req.user.rol_codigo) repetido 6+ veces
// entre turnosGuardia.js y vetosAcceso.js.
const ROLES_ADMIN = Object.freeze(['admin', 'superadmin']);

function esAdmin(user) {
  return Boolean(user) && ROLES_ADMIN.includes(user.rol_codigo);
}

function esSuperadmin(user) {
  return Boolean(user) && user.rol_codigo === 'superadmin';
}

// Regla de negocio repetida en turnosGuardia.js y alertasPanico.js: solo un
// superadmin (que ve todas las residenciales) puede elegir a mano en que
// residencial cae el registro que crea; cualquier otro rol queda forzado a
// la suya propia (evita que alguien inyecte datos en otra residencial
// mandando un residencial_id distinto a mano en el body).
function resolverResidencialId(user, body) {
  return esSuperadmin(user) ? body.residencial_id : user.residencial_id;
}

module.exports = {
  TURNO_ESTADO,
  TURNO_ACCION,
  VETO_ESTADO,
  VETO_ALCANCE,
  CONFLICTO_ESTADO,
  ROLES_ADMIN,
  esAdmin,
  esSuperadmin,
  resolverResidencialId,
};
