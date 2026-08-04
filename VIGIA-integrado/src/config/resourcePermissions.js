'use strict';

// Requisito 13 (administrar roles y permisos) aplicado al resto de la
// API: cada tabla define aca quien puede leer (list/get) y quien puede
// escribir (create/update/remove) via el endpoint CRUD generico.
//
// Formas posibles de una regla:
//   null                          -> solo hace falta estar logueado (requireAuth)
//   { permission: 'codigo' }      -> requireAuth + requirePermission('codigo')
//                                    (usa los codigos ya sembrados en la tabla permisos)
//   { roles: ['admin', ...] }     -> requireAuth + requireRole(...)
//   'blocked'                     -> nadie puede llamarlo por la API (405),
//                                    la tabla se escribe solo desde el backend
//
// Si una tabla nueva no aparece aca (por ejemplo porque se agrego al
// esquema y todavia no se le penso el control de acceso), el router por
// defecto le exige unicamente estar logueado - ver src/routes/index.js.
//
// Ademas de esto, src/utils/crudFactory.js aplica un segundo nivel de
// proteccion automatico: filtra/fuerza residencial_id (y residente_id
// cuando quien pide es un residente) segun el usuario del token, para
// que ni siquiera un rol con permiso de sobra pueda leer o escribir
// datos de OTRA residencial.

const ADMIN = { roles: ['admin', 'superadmin'] };
const AUTH_ONLY = null;

module.exports = {
  residenciales: { create: { permission: 'residenciales.gestionar' }, read: AUTH_ONLY, update: { permission: 'residenciales.gestionar' }, remove: { permission: 'residenciales.gestionar' } },
  roles: { create: { roles: ['superadmin'] }, read: AUTH_ONLY, update: { roles: ['superadmin'] }, remove: { roles: ['superadmin'] } },
  permisos: { create: { roles: ['superadmin'] }, read: AUTH_ONLY, update: { roles: ['superadmin'] }, remove: { roles: ['superadmin'] } },
  roles_permisos: { create: { roles: ['superadmin'] }, read: AUTH_ONLY, update: { roles: ['superadmin'] }, remove: { roles: ['superadmin'] } },

  usuarios: { create: { permission: 'usuarios.gestionar' }, read: { permission: 'usuarios.gestionar' }, update: { permission: 'usuarios.gestionar' }, remove: { permission: 'usuarios.gestionar' } },
  sesiones: { create: ADMIN, read: ADMIN, update: ADMIN, remove: ADMIN },

  viviendas: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  residentes: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  guardias: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  puntos_acceso: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },

  camaras: { create: { permission: 'camaras.gestionar' }, read: { permission: 'camaras.ver' }, update: { permission: 'camaras.gestionar' }, remove: { permission: 'camaras.gestionar' } },
  grabaciones: { create: { permission: 'camaras.gestionar' }, read: { permission: 'camaras.ver' }, update: { permission: 'camaras.gestionar' }, remove: { permission: 'camaras.gestionar' } },

  visitantes: { create: { permission: 'visitas.crear' }, read: AUTH_ONLY, update: { permission: 'visitas.crear' }, remove: { permission: 'visitas.crear' } },
  visitantes_frecuentes: { create: { permission: 'visitas.crear' }, read: AUTH_ONLY, update: { permission: 'visitas.crear' }, remove: { permission: 'visitas.crear' } },
  invitaciones: { create: { permission: 'visitas.crear' }, read: AUTH_ONLY, update: { permission: 'visitas.crear' }, remove: { permission: 'visitas.crear' } },
  vehiculos: { create: { permission: 'visitas.crear' }, read: AUTH_ONLY, update: { permission: 'visitas.crear' }, remove: { permission: 'visitas.crear' } },

  accesos: { create: { permission: 'accesos.registrar' }, read: { permission: 'accesos.consultar' }, update: { permission: 'accesos.registrar' }, remove: ADMIN },

  tipos_incidencia: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  incidencias: { create: { permission: 'incidencias.reportar' }, read: AUTH_ONLY, update: { permission: 'incidencias.gestionar' }, remove: { permission: 'incidencias.gestionar' } },
  incidencias_evidencias: { create: { permission: 'incidencias.reportar' }, read: AUTH_ONLY, update: { permission: 'incidencias.gestionar' }, remove: { permission: 'incidencias.gestionar' } },
  incidencias_seguimiento: { create: { permission: 'incidencias.gestionar' }, read: AUTH_ONLY, update: { permission: 'incidencias.gestionar' }, remove: ADMIN },

  tipos_alerta: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  alertas_panico: { create: { permission: 'alertas.emitir' }, read: AUTH_ONLY, update: { permission: 'alertas.atender' }, remove: ADMIN },
  llegadas_seguras: { create: AUTH_ONLY, read: AUTH_ONLY, update: AUTH_ONLY, remove: ADMIN },

  paquetes: { create: { roles: ['guardia', 'admin', 'superadmin'] }, read: AUTH_ONLY, update: { roles: ['guardia', 'admin', 'superadmin'] }, remove: ADMIN },

  // Las notificaciones las crea el backend (servicios internos), no un
  // usuario a mano por la API. La lectura queda abierta a cualquier
  // logueado porque crudFactory ya la restringe a "mis" notificaciones.
  notificaciones: { create: ADMIN, read: AUTH_ONLY, update: AUTH_ONLY, remove: ADMIN },

  conversaciones: { create: { permission: 'chat.usar' }, read: { permission: 'chat.usar' }, update: { permission: 'chat.usar' }, remove: { permission: 'chat.usar' } },
  conversaciones_participantes: { create: { permission: 'chat.usar' }, read: { permission: 'chat.usar' }, update: { permission: 'chat.usar' }, remove: { permission: 'chat.usar' } },
  mensajes: { create: { permission: 'chat.usar' }, read: { permission: 'chat.usar' }, update: { permission: 'chat.usar' }, remove: { permission: 'chat.usar' } },

  reportes_generados: { create: { permission: 'reportes.generar' }, read: { permission: 'reportes.generar' }, update: ADMIN, remove: ADMIN },



  configuraciones_residencial: { create: ADMIN, read: AUTH_ONLY, update: ADMIN, remove: { roles: ['superadmin'] } },
  personas_autorizadas: { create: { permission: 'autorizados.gestionar' }, read: AUTH_ONLY, update: { permission: 'autorizados.gestionar' }, remove: { permission: 'autorizados.gestionar' } },
  vetos_acceso: { create: { permission: 'vetos.solicitar' }, read: AUTH_ONLY, update: { permission: 'vetos.gestionar' }, remove: { permission: 'vetos.gestionar' } },
  conflictos_permisos: { create: { permission: 'vetos.consultar' }, read: { permission: 'vetos.consultar' }, update: { permission: 'vetos.gestionar' }, remove: { permission: 'vetos.gestionar' } },
  turnos_guardia: { create: { permission: 'turnos.gestionar' }, read: { permission: 'turnos.consultar' }, update: AUTH_ONLY, remove: { permission: 'turnos.gestionar' } },
  cola_acceso: { create: { permission: 'cola.gestionar' }, read: { permission: 'cola.gestionar' }, update: { permission: 'cola.gestionar' }, remove: ADMIN },
  evidencias_acceso: { create: { permission: 'cola.gestionar' }, read: { permission: 'accesos.consultar' }, update: ADMIN, remove: ADMIN },
  integraciones: { create: { permission: 'integraciones.gestionar' }, read: ADMIN, update: { permission: 'integraciones.gestionar' }, remove: { permission: 'integraciones.gestionar' } },
  eventos_integracion: { create: { permission: 'integraciones.gestionar' }, read: ADMIN, update: 'blocked', remove: ADMIN },
  planes_servicio: { create: { roles: ['superadmin'] }, read: AUTH_ONLY, update: { roles: ['superadmin'] }, remove: { roles: ['superadmin'] } },
  suscripciones: { create: { permission: 'suscripciones.gestionar' }, read: { roles: ['superadmin'] }, update: { permission: 'suscripciones.gestionar' }, remove: { roles: ['superadmin'] } },
  contactos_emergencia: { create: AUTH_ONLY, read: AUTH_ONLY, update: AUTH_ONLY, remove: AUTH_ONLY },
  preferencias_usuario: { create: AUTH_ONLY, read: AUTH_ONLY, update: AUTH_ONLY, remove: AUTH_ONLY },
  acciones_offline: { create: { permission: 'offline.sincronizar' }, read: AUTH_ONLY, update: ADMIN, remove: ADMIN },
  publicaciones_comunidad: { create: { permission: 'comunidad.publicar' }, read: AUTH_ONLY, update: { permission: 'comunidad.publicar' }, remove: { permission: 'comunidad.publicar' } },
  moderacion_mensajes: { create: 'blocked', read: ADMIN, update: ADMIN, remove: ADMIN },
  dispositivos_usuario: { create: AUTH_ONLY, read: AUTH_ONLY, update: AUTH_ONLY, remove: AUTH_ONLY },

  // Nadie escribe la bitacora a mano: la llena src/middlewares/bitacoraLogger.js.
  bitacora: { create: 'blocked', read: ADMIN, update: 'blocked', remove: 'blocked' },
};
