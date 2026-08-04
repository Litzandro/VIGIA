'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "mensajes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Mensajes = sequelize.define('Mensajes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    conversacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    contenido: { type: DataTypes.TEXT, allowNull: false },
    tipo_contenido: { type: DataTypes.ENUM('texto', 'imagen', 'archivo'), allowNull: false, defaultValue: 'texto' },
    leido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'mensajes',
    freezeTableName: true,
    timestamps: false,
  });
  return Mensajes;
};
