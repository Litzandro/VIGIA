'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "acciones_offline").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const AccionesOffline = sequelize.define('AccionesOffline', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    client_uid: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    modulo: { type: DataTypes.STRING(60), allowNull: false },
    accion: { type: DataTypes.STRING(60), allowNull: false },
    payload_json: { type: DataTypes.JSON, allowNull: false },
    estado: { type: DataTypes.ENUM('recibida', 'procesada', 'error', 'duplicada'), allowNull: false, defaultValue: 'recibida' },
    intentos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    mensaje_error: { type: DataTypes.STRING(255), allowNull: true },
    fecha_cliente: { type: DataTypes.DATE, allowNull: true },
    fecha_recepcion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_procesamiento: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'acciones_offline',
    freezeTableName: true,
    timestamps: false,
  });
  return AccionesOffline;
};
