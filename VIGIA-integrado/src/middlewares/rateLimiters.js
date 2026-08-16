'use strict';

const rateLimit = require('express-rate-limit');

// Limite general: protege toda la API de abuso/DoS basico por IP sin
// estorbar el uso normal (paginas que hacen varias llamadas al cargar).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes desde esta IP. Intenta de nuevo en unos minutos.' },
});

// Limite estricto para login/registro: dificulta probar contrasenas por
// fuerza bruta o crear cuentas en masa, sin bloquear a alguien que
// simplemente se equivoca un par de veces escribiendo su clave.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
});

module.exports = { apiLimiter, authLimiter };
