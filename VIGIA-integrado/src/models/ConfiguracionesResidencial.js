'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "configuraciones_residencial").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ConfiguracionesResidencial = sequelize.define('ConfiguracionesResidencial', {
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    tiempo_objetivo_acceso_seg: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 90 },
    limite_cola_alerta: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 5 },
    tolerancia_turno_min: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 15 },
    tiempo_sesion_inactiva_min: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 30 },
    requiere_foto_visitante: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    requiere_evidencia_guardia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    modo_offline_habilitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    zona_horaria: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'America/Tegucigalpa' },
    fecha_actualizacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'configuraciones_residencial',
    freezeTableName: true,
    timestamps: false,
  });
  return ConfiguracionesResidencial;
};
