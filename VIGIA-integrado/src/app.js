'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const authRoutes = require('./routes/auth');
const bitacoraLogger = require('./middlewares/bitacoraLogger');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { apiLimiter, authLimiter } = require('./middlewares/rateLimiters');
const { requirePageAuth } = require('./middlewares/auth');

const app = express();

// Necesario para que req.ip / req.secure reflejen al cliente real (y no
// al proxy) cuando VIGIA corre detras de Nginx, Render, Railway, etc.
// Sin esto, el rate limiting por IP y las cookies "secure" se comportan
// mal detras de un proxy. Desactivado por defecto para no romper un
// despliegue directo sin proxy.
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      // 'self' a secas bloqueaba, del lado del NAVEGADOR (antes de que la
      // peticion siquiera saliera a la red), que hls.js pudiera pedir el
      // manifest .m3u8 y los segmentos de una camara real -- por diseno,
      // esas URLs SIEMPRE son de un servidor del cliente (su propia
      // camara/NVR/MediaMTX), nunca del dominio de VIGIA. Sin este
      // permiso, TODA camara HLS fallaria con un error de red generico,
      // sin importar que tan bien configurada estuviera la URL.
      connectSrc: ["'self'", 'https:'],
      // Necesario para que Safari/iOS reproduzca HLS de forma nativa
      // (video.src=url directo, sin hls.js) -- ese camino lo controla
      // media-src, no connect-src.
      mediaSrc: ["'self'", 'https:', 'blob:'],
      workerSrc: ["'self'", 'blob:'],
    },
  },
}));

// CORS: el frontend en public/ se sirve desde el mismo origen que la
// API, asi que las peticiones normales del navegador NO necesitan pasar
// por la lista de abajo -- se detectan comparando el host de la
// peticion (Host, que Express siempre puede leer, no depende de
// TRUST_PROXY) contra el host que mando el navegador en el header
// Origin. Ese header SI viaja incluso en llamadas same-origin (fetch
// con POST/PUT/DELETE lo manda siempre, no solo en llamadas cruzadas),
// asi que sin este chequeo el propio frontend quedaba bloqueado por su
// propia API (bug real: login devolvia 500 "Error interno del
// servidor" en cuanto se activo este middleware).
// CORS_ORIGIN sigue existiendo para habilitar dominios EXTERNOS de
// verdad (apps moviles, paneles aparte); si no se configura, no se
// permite ningun origen externo en vez de aceptar cualquiera.
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function esMismoOrigen(origin, req) {
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch (e) {
    return false;
  }
}

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const permitido = esMismoOrigen(origin, req) || allowedOrigins.includes(origin);
  if (!permitido) console.warn(`CORS: origen rechazado -> ${origin}`);
  callback(null, { origin: permitido, credentials: true });
}));

app.use(cookieParser());

// Limite general para toda la API: mitiga abuso/DoS basico por IP.
app.use('/api', apiLimiter);
// Limite mas estricto solo para login/registro: mitiga fuerza bruta de
// contrasenas y creacion masiva de cuentas.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
// Recuperacion de contraseña: mismo limite estricto -- ahora con mas
// razon, porque verificar-respuesta compara una respuesta de seguridad
// (mucho menos entropia que una contraseña) y sin este limite alguien
// podria probar cientos de respuestas comunes por fuerza bruta.
app.use('/api/auth/recuperar-pregunta', authLimiter);
app.use('/api/auth/verificar-respuesta', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Proteccion de paginas privadas ANTES de express.static. Las rutas de
// API ya validan permisos, pero ahora tampoco se entrega el HTML de los
// paneles a un navegador sin una sesion valida.
const publicHtmlPages = new Set([
  'index.html', 'login.html', 'register.html', 'guardia-login.html',
  'admin-login.html', 'vigialanding.html', 'recuperar-password.html',
  'restablecer-password.html', 'terminos.html', 'politica-privacidad.html',
]);
const residentOnlyPages = new Set(['dashboard.html']);
const guardPages = new Set(['guardia.html']);
const guardAdminPages = new Set(['control-acceso.html']);
const staffPages = new Set(['conflictos.html', 'operaciones.html', 'mensajeria.html']);
const adminPages = new Set(['superadmin.html', 'integraciones.html', 'mi-suscripcion.html']);
const superadminPages = new Set(['suscripciones.html', 'benchmark.html']);

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const page = String(req.path || '').split('/').pop().toLowerCase();
  if (!page.endsWith('.html') || publicHtmlPages.has(page)) return next();
  if (residentOnlyPages.has(page)) return requirePageAuth('residente')(req, res, next);
  if (guardPages.has(page)) return requirePageAuth('guardia', 'admin')(req, res, next);
  if (guardAdminPages.has(page)) return requirePageAuth('guardia', 'admin')(req, res, next);
  if (staffPages.has(page)) return requirePageAuth('guardia', 'admin')(req, res, next);
  if (adminPages.has(page)) return requirePageAuth('admin')(req, res, next);
  if (superadminPages.has(page)) return requirePageAuth('superadmin')(req, res, next);
  return requirePageAuth()(req, res, next);
});

// Sirve el frontend integrado desde la carpeta public.
// Así, interfaz y API usan el mismo origen: http://localhost:3000
app.use(express.static(path.join(__dirname, '..', 'public')));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Requisito 17 (bitacora): se engancha antes de las rutas para que su
// listener de "finish" quede armado desde el arranque de cada request;
// req.user se completa mas adelante en la cadena (requireAuth) y para
// cuando el evento "finish" dispara, ya esta disponible.
app.use(bitacoraLogger);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
