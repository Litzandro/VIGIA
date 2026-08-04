'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "planes_servicio").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PlanesServicio = sequelize.define('PlanesServicio', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    precio_mensual: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    max_viviendas: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    max_guardias: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    incluye_camaras: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    incluye_trancas: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    incluye_soporte: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'planes_servicio',
    freezeTableName: true,
    timestamps: false,
  });
  return PlanesServicio;
};
