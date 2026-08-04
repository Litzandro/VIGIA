'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "roles").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Roles = sequelize.define('Roles', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    nivel: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'roles',
    freezeTableName: true,
    timestamps: false,
  });
  return Roles;
};
