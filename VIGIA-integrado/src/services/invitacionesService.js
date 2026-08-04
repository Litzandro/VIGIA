'use strict';

// Requisito 5: validar una invitacion antes de dejar pasar a un
// visitante. Es una funcion pura (no toca la base ni Express) a
// proposito, para poder reusarla tanto en GET /validar/:codigo_qr
// (overrides/invitaciones.js) como al registrar el acceso
// (overrides/accesos.js), y para poder probarla con datos de mentira
// sin depender de Sequelize.
function evaluarValidez(invitacion, ahora = new Date()) {
  if (!invitacion) {
    return { valido: false, motivo: 'El codigo no existe' };
  }
  if (invitacion.estado === 'cancelada') {
    return { valido: false, motivo: 'La invitacion fue cancelada' };
  }
  if (invitacion.estado === 'expirada') {
    return { valido: false, motivo: 'La invitacion esta expirada' };
  }
  if (ahora < new Date(invitacion.fecha_valida_desde)) {
    return { valido: false, motivo: 'Todavia no llega la fecha valida de la invitacion' };
  }
  if (ahora > new Date(invitacion.fecha_valida_hasta)) {
    return { valido: false, motivo: 'Ya vencio la fecha valida de la invitacion' };
  }
  if (invitacion.usos_actuales >= invitacion.max_usos) {
    return { valido: false, motivo: 'La invitacion ya no tiene usos disponibles' };
  }
  return { valido: true, motivo: null };
}

module.exports = { evaluarValidez };
