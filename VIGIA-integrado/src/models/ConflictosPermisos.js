'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "conflictos_permisos").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ConflictosPermisos = sequelize.define('ConflictosPermisos', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    persona_autorizada_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    veto_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre_persona: { type: DataTypes.STRING(180), allowNull: false },
    numero_documento: { type: DataTypes.STRING(50), allowNull: true },
    descripcion: { type: DataTypes.STRING(255), allowNull: false },
    estado: { type: DataTypes.ENUM('abierto', 'en_revision', 'resuelto_autorizar', 'resuelto_bloquear', 'cerrado'), allowNull: false, defaultValue: 'abierto' },
    detectado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    resuelto_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    resolucion: { type: DataTypes.STRING(255), allowNull: true },
    fecha_deteccion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_resolucion: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'conflictos_permisos',
    freezeTableName: true,
    timestamps: false,
  });
  return ConflictosPermisos;
};
