'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "paquetes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Paquetes = sequelize.define('Paquetes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    vivienda_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    recibido_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    entregado_a: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    empresa_envio: { type: DataTypes.STRING(100), allowNull: true },
    estado: { type: DataTypes.ENUM('pendiente', 'entregado', 'devuelto'), allowNull: false, defaultValue: 'pendiente' },
    fecha_recepcion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_entrega: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'paquetes',
    freezeTableName: true,
    timestamps: false,
  });
  return Paquetes;
};
