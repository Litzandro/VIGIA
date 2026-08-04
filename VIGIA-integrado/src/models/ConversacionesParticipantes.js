'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "conversaciones_participantes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ConversacionesParticipantes = sequelize.define('ConversacionesParticipantes', {
    conversacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    fecha_union: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'conversaciones_participantes',
    freezeTableName: true,
    timestamps: false,
  });
  return ConversacionesParticipantes;
};
