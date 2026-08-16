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
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
    },
  },
}));

// CORS: el frontend en public/ se sirve desde el mismo origen que la
// API, asi que no necesita CORS para nada (los navegadores no aplican
// CORS a peticiones same-origin). Esto solo habilita llamadas desde
// OTROS dominios (apps moviles, paneles externos), y unicamente los que
// esten en CORS_ORIGIN. Si no se configura, no se permite ningun origen
// externo en vez de aceptar cualquiera.
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sin header Origin (curl, apps nativas, same-origin) -> se permite.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no autorizado por CORS'));
  },
  credentials: true,
}));

app.use(cookieParser());

// Limite general para toda la API: mitiga abuso/DoS basico por IP.
app.use('/api', apiLimiter);
// Limite mas estricto solo para login/registro: mitiga fuerza bruta de
// contrasenas y creacion masiva de cuentas.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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
