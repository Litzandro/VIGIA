'use strict';

// Las sanciones nunca se crean llamando a este recurso directo -- se
// generan SOLO como efecto secundario de rechazar una incidencia
// marcada como irrespetuosa/falsa (ver la accion "revisar" en
// src/routes/overrides/incidencias.js, que es quien de verdad valida
// quien puede sancionar a quien y por que). Este override existe nada
// mas para que /api/sanciones-usuarios sirva para CONSULTAR el
// historial (admin/superadmin, ya filtrado por resourcePermissions.js)
// sin exponer un POST/PUT/DELETE genérico que dejaria sancionar a
// cualquiera sin pasar por ese flujo.
module.exports = function sancionesUsuariosOverride({ router, handlers, pkPath }) {
  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);
  router.post('/', (req, res) => res.status(405).json({ error: 'Las sanciones solo se generan al rechazar una incidencia (ver incidencias.js).' }));
};
