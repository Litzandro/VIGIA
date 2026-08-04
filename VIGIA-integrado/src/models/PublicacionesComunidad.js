'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "publicaciones_comunidad").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PublicacionesComunidad = sequelize.define('PublicacionesComunidad', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    categoria: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'General' },
    contenido: { type: DataTypes.STRING(500), allowNull: false },
    visibilidad: { type: DataTypes.ENUM('residencial', 'torre', 'administracion'), allowNull: false, defaultValue: 'residencial' },
    bloque_torre: { type: DataTypes.STRING(20), allowNull: true },
    estado: { type: DataTypes.ENUM('publicada', 'oculta', 'eliminada'), allowNull: false, defaultValue: 'publicada' },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'publicaciones_comunidad',
    freezeTableName: true,
    timestamps: false,
  });
  return PublicacionesComunidad;
};
