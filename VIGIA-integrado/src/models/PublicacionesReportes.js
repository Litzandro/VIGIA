'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "publicaciones_reportes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PublicacionesReportes = sequelize.define('PublicacionesReportes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    publicacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    reportado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    motivo: { type: DataTypes.ENUM('spam', 'ofensivo', 'acoso', 'informacion_falsa', 'otro'), allowNull: false },
    comentario: { type: DataTypes.STRING(255), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'publicaciones_reportes',
    freezeTableName: true,
    timestamps: false,
  });
  return PublicacionesReportes;
};
