'use strict';

// Este archivo SI es manual (a diferencia de los demas en esta carpeta,
// que genera scripts/generate-models.js). Carga todos los modelos
// generados y conecta las asociaciones a partir de _associations.json.
//
// No hace falta tocarlo cuando se agrega una tabla nueva: basta con
// correr "npm run generate:models" y este archivo la recoge sola.

const fs = require('fs');
const path = require('path');
const { DataTypes, Sequelize } = require('sequelize');
const sequelize = require('../config/database');

const basename = path.basename(__filename);
const db = {};

fs.readdirSync(__dirname)
  .filter((f) => f !== basename && f.endsWith('.js') && !f.startsWith('_'))
  .forEach((file) => {
    const defineModel = require(path.join(__dirname, file));
    const model = defineModel(sequelize, DataTypes);
    db[model.name] = model;
  });

// Mapa nombre de tabla real (snake_case) -> modelo, porque las
// asociaciones en _associations.json se guardaron con nombres de tabla.
const byTable = {};
Object.values(db).forEach((model) => {
  byTable[model.getTableName()] = model;
});

let associations = [];
const assocPath = path.join(__dirname, '_associations.json');
if (fs.existsSync(assocPath)) {
  associations = JSON.parse(fs.readFileSync(assocPath, 'utf8'));
}

function toCamelCase(column) {
  const base = column.replace(/_id$/, '');
  return base.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

associations.forEach(({ table, column, refTable }) => {
  const source = byTable[table];
  const target = byTable[refTable];
  if (!source || !target) {
    console.warn(`[models/index] Asociacion ignorada: ${table}.${column} -> ${refTable} (modelo no encontrado)`);
    return;
  }

  // constraints:false porque la llave foranea ya existe fisicamente en la
  // base (creada por vigia_schema.sql); no queremos que Sequelize intente
  // crear/gestionar la constraint de nuevo via sync().
  const forwardAlias = toCamelCase(column);
  source.belongsTo(target, { foreignKey: column, as: forwardAlias, constraints: false });

  // Alias inversa siempre unica: combina tabla origen + columna, porque
  // una misma tabla destino (ej. usuarios) puede recibir varias FKs
  // distintas desde una misma tabla origen (ej. accesos.usuario_id y
  // accesos.guardia_id apuntan ambas a usuarios).
  const reverseAlias = `${table}_${column}`;
  target.hasMany(source, { foreignKey: column, as: reverseAlias, constraints: false });
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
