'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "notificaciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Notificaciones = sequelize.define('Notificaciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.STRING(40), allowNull: false },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    mensaje: { type: DataTypes.STRING(255), allowNull: false },
    referencia_tipo: { type: DataTypes.STRING(40), allowNull: true },
    referencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    leida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'notificaciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Notificaciones;
};
