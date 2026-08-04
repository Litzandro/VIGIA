'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "puntos_acceso").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PuntosAcceso = sequelize.define('PuntosAcceso', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    tipo: { type: DataTypes.ENUM('peatonal', 'vehicular', 'mixto'), allowNull: false, defaultValue: 'mixto' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'puntos_acceso',
    freezeTableName: true,
    timestamps: false,
  });
  return PuntosAcceso;
};
