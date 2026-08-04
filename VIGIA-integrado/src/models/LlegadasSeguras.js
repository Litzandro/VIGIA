'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "llegadas_seguras").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const LlegadasSeguras = sequelize.define('LlegadasSeguras', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    residente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    ubicacion_origen: { type: DataTypes.STRING(255), allowNull: true },
    hora_estimada_llegada: { type: DataTypes.DATE, allowNull: false },
    estado: { type: DataTypes.ENUM('en_curso', 'completada', 'alerta_generada', 'cancelada'), allowNull: false, defaultValue: 'en_curso' },
    contacto_confirmacion: { type: DataTypes.STRING(150), allowNull: true },
    fecha_inicio: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_fin: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'llegadas_seguras',
    freezeTableName: true,
    timestamps: false,
  });
  return LlegadasSeguras;
};
