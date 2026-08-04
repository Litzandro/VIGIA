'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "permisos").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Permisos = sequelize.define('Permisos', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    modulo: { type: DataTypes.STRING(60), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'permisos',
    freezeTableName: true,
    timestamps: false,
  });
  return Permisos;
};
