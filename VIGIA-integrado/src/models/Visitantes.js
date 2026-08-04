'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "visitantes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Visitantes = sequelize.define('Visitantes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    apellido: { type: DataTypes.STRING(100), allowNull: false },
    tipo_documento: { type: DataTypes.STRING(30), allowNull: true },
    numero_documento: { type: DataTypes.STRING(50), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    foto_url: { type: DataTypes.STRING(255), allowNull: true },
    fecha_registro: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'visitantes',
    freezeTableName: true,
    timestamps: false,
  });
  return Visitantes;
};
