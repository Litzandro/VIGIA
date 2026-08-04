'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "alertas_panico").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const AlertasPanico = sequelize.define('AlertasPanico', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo_alerta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    ubicacion_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    ubicacion_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    estado: { type: DataTypes.ENUM('activa', 'atendida', 'falsa_alarma'), allowNull: false, defaultValue: 'activa' },
    atendida_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_atencion: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'alertas_panico',
    freezeTableName: true,
    timestamps: false,
  });
  return AlertasPanico;
};
