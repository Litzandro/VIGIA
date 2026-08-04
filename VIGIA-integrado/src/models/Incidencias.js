'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "incidencias").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Incidencias = sequelize.define('Incidencias', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo_incidencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    reportado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    asignado_a: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_original_nombre: { type: DataTypes.STRING(180), allowNull: true },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: false },
    visibilidad: { type: DataTypes.ENUM('privada', 'administracion', 'comunidad'), allowNull: false, defaultValue: 'privada' },
    ubicacion: { type: DataTypes.STRING(255), allowNull: true },
    prioridad: { type: DataTypes.ENUM('baja', 'media', 'alta', 'urgente'), allowNull: false, defaultValue: 'media' },
    estado: { type: DataTypes.ENUM('reportada', 'en_revision', 'resuelta', 'cerrada'), allowNull: false, defaultValue: 'reportada' },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_resolucion: { type: DataTypes.DATE, allowNull: true },
    cerrada_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  }, {
    tableName: 'incidencias',
    freezeTableName: true,
    timestamps: false,
  });
  return Incidencias;
};
