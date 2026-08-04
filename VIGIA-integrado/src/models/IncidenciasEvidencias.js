'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "incidencias_evidencias").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const IncidenciasEvidencias = sequelize.define('IncidenciasEvidencias', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    incidencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo_archivo: { type: DataTypes.ENUM('imagen', 'video', 'documento'), allowNull: false },
    url_archivo: { type: DataTypes.TEXT('medium'), allowNull: true },
    camara_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    grabacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_subida: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'incidencias_evidencias',
    freezeTableName: true,
    timestamps: false,
  });
  return IncidenciasEvidencias;
};
