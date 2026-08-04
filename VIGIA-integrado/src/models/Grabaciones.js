'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "grabaciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Grabaciones = sequelize.define('Grabaciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    camara_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fecha_inicio: { type: DataTypes.DATE, allowNull: false },
    fecha_fin: { type: DataTypes.DATE, allowNull: true },
    motivo: { type: DataTypes.ENUM('continua', 'evento', 'manual'), allowNull: false, defaultValue: 'evento' },
    archivo_url: { type: DataTypes.STRING(255), allowNull: false },
    tamano_mb: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'grabaciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Grabaciones;
};
