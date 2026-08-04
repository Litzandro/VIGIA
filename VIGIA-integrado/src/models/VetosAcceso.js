'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "vetos_acceso").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const VetosAcceso = sequelize.define('VetosAcceso', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    solicitado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    aprobado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre_persona: { type: DataTypes.STRING(180), allowNull: false },
    tipo_documento: { type: DataTypes.STRING(30), allowNull: true },
    numero_documento: { type: DataTypes.STRING(50), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    alcance: { type: DataTypes.ENUM('vivienda', 'residencial'), allowNull: false, defaultValue: 'vivienda' },
    motivo: { type: DataTypes.STRING(255), allowNull: false },
    evidencia_url: { type: DataTypes.TEXT('medium'), allowNull: true },
    estado: { type: DataTypes.ENUM('pendiente', 'activo', 'rechazado', 'revocado', 'vencido'), allowNull: false, defaultValue: 'pendiente' },
    fecha_desde: { type: DataTypes.DATE, allowNull: true },
    fecha_hasta: { type: DataTypes.DATE, allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_resolucion: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'vetos_acceso',
    freezeTableName: true,
    timestamps: false,
  });
  return VetosAcceso;
};
