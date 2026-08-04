'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "tipos_alerta").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const TiposAlerta = sequelize.define('TiposAlerta', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
  }, {
    tableName: 'tipos_alerta',
    freezeTableName: true,
    timestamps: false,
  });
  return TiposAlerta;
};
