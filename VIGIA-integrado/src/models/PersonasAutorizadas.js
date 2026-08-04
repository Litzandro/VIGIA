'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "personas_autorizadas").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PersonasAutorizadas = sequelize.define('PersonasAutorizadas', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    residente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM('bus_escolar', 'familiar', 'servicio_domestico', 'proveedor', 'transporte', 'otro'), allowNull: false },
    nombre_completo: { type: DataTypes.STRING(180), allowNull: false },
    tipo_documento: { type: DataTypes.STRING(30), allowNull: true },
    numero_documento: { type: DataTypes.STRING(50), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    empresa: { type: DataTypes.STRING(120), allowNull: true },
    placa_vehiculo: { type: DataTypes.STRING(20), allowNull: true },
    foto_url: { type: DataTypes.TEXT('medium'), allowNull: true },
    dias_semana_json: { type: DataTypes.JSON, allowNull: true },
    hora_desde: { type: DataTypes.STRING(5), allowNull: true },
    hora_hasta: { type: DataTypes.STRING(5), allowNull: true },
    fecha_desde: { type: DataTypes.DATEONLY, allowNull: true },
    fecha_hasta: { type: DataTypes.DATEONLY, allowNull: true },
    max_accesos_dia: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2 },
    estado: { type: DataTypes.ENUM('pendiente', 'activa', 'suspendida', 'vencida', 'cancelada'), allowNull: false, defaultValue: 'pendiente' },
    notas: { type: DataTypes.STRING(255), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_actualizacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'personas_autorizadas',
    freezeTableName: true,
    timestamps: false,
  });
  return PersonasAutorizadas;
};
