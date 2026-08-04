'use strict';

require('dotenv').config();
const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'mysql';

// Permite forzar sqlite en memoria (VIGIA_TEST_SQLITE=1) para pruebas
// offline sin necesidad de un servidor MySQL corriendo. En produccion
// siempre se usa mysql segun el .env.
const useSqliteMemory = process.env.VIGIA_TEST_SQLITE === '1';

const sequelize = useSqliteMemory
  ? new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME || 'vigia',
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 3306,
        dialect,
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        define: {
          // Los nombres de tabla ya vienen en snake_case/plural desde el
          // SQL (usuarios, incidencias, etc.) y no queremos que Sequelize
          // los pluralice/singularice de nuevo.
          freezeTableName: true,
          timestamps: false,
        },
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      }
    );

module.exports = sequelize;
