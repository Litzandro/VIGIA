'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "tipos_incidencia").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const TiposIncidencia = sequelize.define('TiposIncidencia', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    nivel_urgencia: { type: DataTypes.ENUM('bajo', 'medio', 'alto', 'critico'), allowNull: false, defaultValue: 'medio' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'tipos_incidencia',
    freezeTableName: true,
    timestamps: false,
  });
  return TiposIncidencia;
};
