'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "plantilla_turno_guardias").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PlantillaTurnoGuardias = sequelize.define('PlantillaTurnoGuardias', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    plantilla_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    guardia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    orden: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'plantilla_turno_guardias',
    freezeTableName: true,
    timestamps: false,
  });
  return PlantillaTurnoGuardias;
};
