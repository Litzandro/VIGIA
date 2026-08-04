'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "viviendas").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Viviendas = sequelize.define('Viviendas', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    numero: { type: DataTypes.STRING(20), allowNull: false },
    bloque_torre: { type: DataTypes.STRING(20), allowNull: true },
    tipo: { type: DataTypes.STRING(40), allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'viviendas',
    freezeTableName: true,
    timestamps: false,
  });
  return Viviendas;
};
