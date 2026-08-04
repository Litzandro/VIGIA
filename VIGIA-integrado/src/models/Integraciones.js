'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "integraciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Integraciones = sequelize.define('Integraciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM('tranca', 'camara', 'sistema_colonia', 'webhook', 'ia', 'control_acceso'), allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    proveedor: { type: DataTypes.STRING(120), allowNull: true },
    endpoint_url: { type: DataTypes.STRING(255), allowNull: true },
    secreto_referencia: { type: DataTypes.STRING(120), allowNull: true },
    configuracion_json: { type: DataTypes.JSON, allowNull: true },
    modo: { type: DataTypes.ENUM('simulador', 'pruebas', 'produccion'), allowNull: false, defaultValue: 'simulador' },
    estado: { type: DataTypes.ENUM('activa', 'inactiva', 'error', 'mantenimiento'), allowNull: false, defaultValue: 'inactiva' },
    ultima_sincronizacion: { type: DataTypes.DATE, allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'integraciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Integraciones;
};
