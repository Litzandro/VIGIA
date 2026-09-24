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
    // MEDIUMTEXT (no STRING(255)): el registro por foto guarda aqui la
    // imagen como data URL base64, que facil pasa de los 255
    // caracteres -- con VARCHAR(255) la insercion tronaba con "Data too
    // long for column 'foto_url'" en cuanto alguien completaba un
    // ingreso por camara/foto desde Control de acceso rapido.
    foto_url: { type: DataTypes.TEXT('medium'), allowNull: true },
    fecha_registro: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'visitantes',
    freezeTableName: true,
    timestamps: false,
  });
  return Visitantes;
};
