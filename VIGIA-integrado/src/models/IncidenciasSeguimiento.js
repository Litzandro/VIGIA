'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "incidencias_seguimiento").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const IncidenciasSeguimiento = sequelize.define('IncidenciasSeguimiento', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    incidencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    comentario: { type: DataTypes.TEXT, allowNull: true },
    estado_anterior: { type: DataTypes.ENUM('reportada', 'en_revision', 'resuelta', 'cerrada'), allowNull: true },
    estado_nuevo: { type: DataTypes.ENUM('reportada', 'en_revision', 'resuelta', 'cerrada'), allowNull: false },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'incidencias_seguimiento',
    freezeTableName: true,
    timestamps: false,
  });
  return IncidenciasSeguimiento;
};
