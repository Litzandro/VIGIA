'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "invitaciones").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Invitaciones = sequelize.define('Invitaciones', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    codigo_qr: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    residente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    tipo: { type: DataTypes.ENUM('unico_uso', 'temporal', 'evento'), allowNull: false, defaultValue: 'unico_uso' },
    nombre_evento: { type: DataTypes.STRING(150), allowNull: true },
    fecha_valida_desde: { type: DataTypes.DATE, allowNull: false },
    fecha_valida_hasta: { type: DataTypes.DATE, allowNull: false },
    max_usos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    usos_actuales: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    estado: { type: DataTypes.ENUM('pendiente', 'usada', 'expirada', 'cancelada'), allowNull: false, defaultValue: 'pendiente' },
    canal_envio: { type: DataTypes.ENUM('whatsapp', 'correo', 'manual'), allowNull: false, defaultValue: 'manual' },
    notas: { type: DataTypes.STRING(255), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'invitaciones',
    freezeTableName: true,
    timestamps: false,
  });
  return Invitaciones;
};
