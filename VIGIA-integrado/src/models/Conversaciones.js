'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "conversaciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Conversaciones = sequelize.define('Conversaciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM('directa', 'grupo'), allowNull: false, defaultValue: 'directa' },
    nombre: { type: DataTypes.STRING(150), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'conversaciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Conversaciones;
};
