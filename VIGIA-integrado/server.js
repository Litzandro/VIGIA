'use strict';

require('dotenv').config();
const app = require('./src/app');
const db = require('./src/models');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Conexion a MySQL establecida correctamente.');
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    console.error('Revisa las variables DB_* en tu archivo .env (copia .env.example).');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`VIGIA API escuchando en http://localhost:${PORT}`);
    console.log(`Explorar recursos disponibles: http://localhost:${PORT}/api`);
  });
}

start();
