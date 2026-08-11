'use strict';

// Punto unico para crear notificaciones (requisito 1: centralizar la
// logica de "notificacion publica para todo un residencial", que antes
// cada override (incidencias.js, publicacionesComunidad.js) repetia a
// mano con su propio db.Usuarios.findAll + Promise.all).

const { Op } = require('sequelize');

function getDb() {
  return require('../models');
}

// Notificacion para UN usuario especifico. Es la funcion base: todo lo
// demas (incluida crearParaResidencial) termina llamando a esta, asi
// que la fila que cada quien recibe siempre tiene su propio
// leida/no-leida independiente y nunca se comparte una sola fila entre
// varias cuentas.
async function crearParaUsuario({ usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id }) {
  if (!usuario_id) return null;
  const db = getDb();
  return db.Notificaciones.create({
    usuario_id,
    tipo,
    titulo,
    mensaje,
    referencia_tipo: referencia_tipo || null,
    referencia_id: referencia_id || null,
    leida: false,
  });
}

// Notificacion "publica" para todos los usuarios activos de UN
// residencial (avisos de administracion, incidencias con visibilidad
// "comunidad", publicaciones del muro, etc). Garantiza:
//   - una fila independiente por usuario (para que cada quien tenga su
//     propio estado leida/no-leida y aparezca al iniciar sesion, sin
//     depender de que otro la marque primero);
//   - nunca sale del residencial indicado (nunca cruza a otro);
//   - solo usuarios con estado "activo";
//   - sin duplicados: cada usuario recibe una unica fila por llamada,
//     porque se resuelve la lista de destinatarios una sola vez antes
//     de crear.
// excluirUsuarioId sirve para no notificarle al propio autor de la
// accion (el que reporto la incidencia publica, el que publico en el
// muro), y soloRoles para restringir a ciertos roles del residencial
// (por ejemplo, solo guardia/admin).
async function crearParaResidencial({ residencial_id, excluirUsuarioId, soloRoles, tipo, titulo, mensaje, referencia_tipo, referencia_id }) {
  if (!residencial_id) return [];
  const db = getDb();
  const where = { residencial_id, estado: 'activo' };
  if (excluirUsuarioId) where.id = { [Op.ne]: excluirUsuarioId };
  const include = soloRoles && soloRoles.length
    ? [{ model: db.Roles, as: 'rol', where: { codigo: soloRoles } }]
    : [];
  const destinatarios = await db.Usuarios.findAll({ where, include, attributes: ['id'] });
  return Promise.all(destinatarios.map((u) => crearParaUsuario({
    usuario_id: u.id,
    tipo,
    titulo,
    mensaje,
    referencia_tipo,
    referencia_id,
  })));
}

module.exports = {
  // "crear" se conserva por compatibilidad: los overrides existentes
  // (accesos.js, alertasPanico.js) ya la usan tal cual para notificar a
  // un solo usuario a la vez.
  crear: crearParaUsuario,
  crearParaUsuario,
  crearParaResidencial,
};
