'use strict';

// Traduce errores tipicos de Sequelize a respuestas HTTP claras y evita
// filtrar detalles internos (stack trace) al cliente. Los 4 parametros
// son obligatorios: es lo que le indica a Express que esto es un
// error handler y no un middleware normal.
module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      error: 'Datos invalidos',
      detalles: (err.errors || []).map((e) => ({ campo: e.path, mensaje: e.message })),
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({
      error: 'La operacion viola una relacion existente (llave foranea)',
      detalle: err.message,
    });
  }

  if (err.name === 'SequelizeDatabaseError') {
    return res.status(400).json({ error: 'Error de base de datos', detalle: err.message });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Error interno del servidor' : err.message,
  });
};
