'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "roles_permisos").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const RolesPermisos = sequelize.define('RolesPermisos', {
    rol_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    permiso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
  }, {
    tableName: 'roles_permisos',
    freezeTableName: true,
    timestamps: false,
  });
  return RolesPermisos;
};
