'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "vehiculos").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Vehiculos = sequelize.define('Vehiculos', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    placa: { type: DataTypes.STRING(20), allowNull: false },
    marca: { type: DataTypes.STRING(60), allowNull: true },
    modelo: { type: DataTypes.STRING(60), allowNull: true },
    color: { type: DataTypes.STRING(40), allowNull: true },
    residente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  }, {
    tableName: 'vehiculos',
    freezeTableName: true,
    timestamps: false,
  });
  return Vehiculos;
};
