'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "turnos_guardia").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const TurnosGuardia = sequelize.define('TurnosGuardia', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    punto_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_original_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    guardia_relevo_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    inicio_programado: { type: DataTypes.DATE, allowNull: false },
    fin_programado: { type: DataTypes.DATE, allowNull: false },
    inicio_real: { type: DataTypes.DATE, allowNull: true },
    fin_real: { type: DataTypes.DATE, allowNull: true },
    estado: { type: DataTypes.ENUM('programado', 'activo', 'relevado', 'finalizado', 'ausente'), allowNull: false, defaultValue: 'programado' },
    observaciones: { type: DataTypes.STRING(255), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'turnos_guardia',
    freezeTableName: true,
    timestamps: false,
  });
  return TurnosGuardia;
};
