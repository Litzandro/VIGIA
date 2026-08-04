'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "guardias").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Guardias = sequelize.define('Guardias', {
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    numero_empleado: { type: DataTypes.STRING(30), allowNull: true },
    turno: { type: DataTypes.ENUM('diurno', 'nocturno', 'rotativo'), allowNull: false, defaultValue: 'rotativo' },
  }, {
    tableName: 'guardias',
    freezeTableName: true,
    timestamps: false,
  });
  return Guardias;
};
