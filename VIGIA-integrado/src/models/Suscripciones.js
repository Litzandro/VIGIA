'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "suscripciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Suscripciones = sequelize.define('Suscripciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    plan_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    estado: { type: DataTypes.ENUM('prueba', 'activa', 'suspendida', 'vencida', 'cancelada'), allowNull: false, defaultValue: 'prueba' },
    fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_fin_prueba: { type: DataTypes.DATEONLY, allowNull: true },
    proxima_facturacion: { type: DataTypes.DATEONLY, allowNull: true },
    precio_acordado: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    ciclo: { type: DataTypes.ENUM('mensual', 'trimestral', 'anual'), allowNull: false, defaultValue: 'mensual' },
    notas: { type: DataTypes.STRING(255), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'suscripciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Suscripciones;
};
