'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "plantillas_turno").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PlantillasTurno = sequelize.define('PlantillasTurno', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    punto_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    hora_inicio: { type: DataTypes.TIME, allowNull: false },
    hora_fin: { type: DataTypes.TIME, allowNull: false },
    dias_semana: { type: DataTypes.STRING(20), allowNull: false },
    activa: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    creado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'plantillas_turno',
    freezeTableName: true,
    timestamps: false,
  });
  return PlantillasTurno;
};
