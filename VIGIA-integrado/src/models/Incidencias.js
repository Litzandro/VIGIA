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
    // Cuando ocurrio el hecho de verdad -- distinto de "fecha_hora" (que
    // es cuando se REPORTO, casi siempre un poco despues del hecho real).
    fecha_hora_hecho: { type: DataTypes.DATE, allowNull: true },
    prioridad: { type: DataTypes.ENUM('baja', 'media', 'alta', 'urgente'), allowNull: false, defaultValue: 'media' },
    // "pendiente_aprobacion": estado inicial cuando reporta un residente
    // (ver src/routes/overrides/incidencias.js); "rechazada": guardia/admin
    // no lo aprobaron.
    estado: { type: DataTypes.ENUM('pendiente_aprobacion', 'reportada', 'en_revision', 'resuelta', 'cerrada', 'rechazada'), allowNull: false, defaultValue: 'reportada' },
    motivo_rechazo: { type: DataTypes.STRING(255), allowNull: true },
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
