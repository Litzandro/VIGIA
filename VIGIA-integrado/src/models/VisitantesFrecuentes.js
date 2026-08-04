'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "visitantes_frecuentes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const VisitantesFrecuentes = sequelize.define('VisitantesFrecuentes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    residente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    alias: { type: DataTypes.STRING(100), allowNull: true },
    fecha_registro: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'visitantes_frecuentes',
    freezeTableName: true,
    timestamps: false,
  });
  return VisitantesFrecuentes;
};
