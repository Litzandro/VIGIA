'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "sesiones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Sesiones = sequelize.define('Sesiones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false },
    dispositivo: { type: DataTypes.STRING(150), allowNull: true },
    ip_origen: { type: DataTypes.STRING(45), allowNull: true },
    fecha_inicio: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_expiracion: { type: DataTypes.DATE, allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'sesiones',
    freezeTableName: true,
    timestamps: false,
  });
  return Sesiones;
};
