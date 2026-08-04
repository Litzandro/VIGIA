'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "evidencias_acceso").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const EvidenciasAcceso = sequelize.define('EvidenciasAcceso', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    cola_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM('foto_persona', 'foto_documento', 'foto_vehiculo', 'captura_camara', 'otro'), allowNull: false },
    url_archivo: { type: DataTypes.TEXT('medium'), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    fecha_captura: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'evidencias_acceso',
    freezeTableName: true,
    timestamps: false,
  });
  return EvidenciasAcceso;
};
