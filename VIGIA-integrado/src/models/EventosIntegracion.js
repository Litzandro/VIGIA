'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "eventos_integracion").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const EventosIntegracion = sequelize.define('EventosIntegracion', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    integracion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    accion: { type: DataTypes.STRING(80), allowNull: false },
    estado: { type: DataTypes.ENUM('pendiente', 'exitoso', 'fallido', 'simulado'), allowNull: false, defaultValue: 'pendiente' },
    solicitud_json: { type: DataTypes.JSON, allowNull: true },
    respuesta_json: { type: DataTypes.JSON, allowNull: true },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'eventos_integracion',
    freezeTableName: true,
    timestamps: false,
  });
  return EventosIntegracion;
};
