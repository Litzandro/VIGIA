'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "sanciones_usuarios").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const SancionesUsuarios = sequelize.define('SancionesUsuarios', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    incidencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    motivo: { type: DataTypes.STRING(255), allowNull: false },
    aplicado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'sanciones_usuarios',
    freezeTableName: true,
    timestamps: false,
  });
  return SancionesUsuarios;
};
