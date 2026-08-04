'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "accesos").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Accesos = sequelize.define('Accesos', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    punto_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    invitacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    vehiculo_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    camara_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    turno_guardia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_original_nombre: { type: DataTypes.STRING(180), allowNull: true },
    tipo_movimiento: { type: DataTypes.ENUM('entrada', 'salida'), allowNull: false },
    fecha_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    duracion_proceso_seg: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    modo_registro: { type: DataTypes.ENUM('qr', 'foto', 'documento', 'manual', 'offline', 'integracion'), allowNull: false, defaultValue: 'manual' },
    observaciones: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'accesos',
    freezeTableName: true,
    timestamps: false,
  });
  return Accesos;
};
