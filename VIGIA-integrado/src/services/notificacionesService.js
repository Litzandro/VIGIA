'use strict';

// Punto unico para crear notificaciones (requisito 9: notificar al
// residente cuando su visita ingresa/sale; tambien se reusa para
// paquetes y alertas). Centralizarlo aca evita que cada controlador
// tenga que saber la forma exacta de la tabla notificaciones.

function getDb() {
  return require('../models');
}

async function crear({ usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id }) {
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

module.exports = { crear };
