'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "bitacora").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Bitacora = sequelize.define('Bitacora', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    accion: { type: DataTypes.STRING(100), allowNull: false },
    modulo: { type: DataTypes.STRING(60), allowNull: false },
    entidad_afectada: { type: DataTypes.STRING(60), allowNull: true },
    entidad_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    detalles_json: { type: DataTypes.JSON, allowNull: true },
    ip_origen: { type: DataTypes.STRING(45), allowNull: true },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'bitacora',
    freezeTableName: true,
    timestamps: false,
  });
  return Bitacora;
};
