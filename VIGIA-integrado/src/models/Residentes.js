'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "residentes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Residentes = sequelize.define('Residentes', {
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    vivienda_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo_residente: { type: DataTypes.ENUM('propietario', 'inquilino', 'familiar'), allowNull: false, defaultValue: 'propietario' },
    fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: true },
    contacto_emergencia_nombre: { type: DataTypes.STRING(150), allowNull: true },
    contacto_emergencia_telefono: { type: DataTypes.STRING(30), allowNull: true },
  }, {
    tableName: 'residentes',
    freezeTableName: true,
    timestamps: false,
  });
  return Residentes;
};
