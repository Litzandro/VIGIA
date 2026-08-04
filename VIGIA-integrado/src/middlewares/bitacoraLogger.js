'use strict';

// Requisito 17: registrar todas las acciones importantes del sistema.
// Se engancha una sola vez, de forma global, y escribe en la tabla
// bitacora cualquier POST/PUT/PATCH/DELETE que haya terminado en un
// codigo de exito (2xx). Los GET no se registran (son solo consultas).
//
// Se escribe DESPUES de que la respuesta ya se mando (evento
// "finish"), para no atrasar al usuario esperando el INSERT. Para
// entonces req.user ya esta poblado (si la ruta tenia requireAuth),
// porque ese middleware corre antes en la cadena y muta el mismo
// objeto req.

function getDb() {
  return require('../models');
}

module.exports = function bitacoraLogger(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode >= 400) return;

    const partes = req.originalUrl.split('?')[0].split('/').filter(Boolean); // ['api', 'recurso', ...]
    const modulo = partes[1] || 'desconocido';

    const db = getDb();
    db.Bitacora.create({
      usuario_id: req.user ? req.user.id : null,
      residencial_id: req.user ? req.user.residencial_id : null,
      accion: `${req.method} ${req.originalUrl}`,
      modulo,
      entidad_afectada: modulo,
      entidad_id: req.params && req.params.id ? String(req.params.id) : null,
      ip_origen: req.ip,
    }).catch((err) => {
      // Si falla el log no debe tumbar la app ni afectar al usuario:
      // ya se le respondio antes de llegar aca.
      console.error('[bitacoraLogger] no se pudo registrar la accion:', err.message);
    });
  });

  next();
};
