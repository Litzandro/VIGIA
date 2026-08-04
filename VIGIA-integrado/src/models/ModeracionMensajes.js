'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "moderacion_mensajes").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ModeracionMensajes = sequelize.define('ModeracionMensajes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    mensaje_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    motor: { type: DataTypes.ENUM('reglas_locales', 'ia_externa', 'revision_manual'), allowNull: false, defaultValue: 'reglas_locales' },
    estado: { type: DataTypes.ENUM('permitido', 'advertencia', 'retenido', 'rechazado'), allowNull: false, defaultValue: 'permitido' },
    categoria: { type: DataTypes.STRING(60), allowNull: true },
    puntaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    detalle: { type: DataTypes.STRING(255), allowNull: true },
    revisado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_revision: { type: DataTypes.DATE, allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'moderacion_mensajes',
    freezeTableName: true,
    timestamps: false,
  });
  return ModeracionMensajes;
};
