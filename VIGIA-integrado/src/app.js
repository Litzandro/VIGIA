'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const authRoutes = require('./routes/auth');
const bitacoraLogger = require('./middlewares/bitacoraLogger');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

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
app.use(cors());
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
