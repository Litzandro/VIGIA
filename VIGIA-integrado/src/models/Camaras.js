'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "camaras").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Camaras = sequelize.define('Camaras', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    punto_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    ubicacion: { type: DataTypes.STRING(255), allowNull: false },
    tipo: { type: DataTypes.ENUM('fija', 'ptz', 'domo'), allowNull: false, defaultValue: 'fija' },
    marca: { type: DataTypes.STRING(60), allowNull: true },
    modelo: { type: DataTypes.STRING(60), allowNull: true },
    direccion_ip: { type: DataTypes.STRING(45), allowNull: true },
    puerto: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    protocolo: { type: DataTypes.ENUM('rtsp', 'http', 'onvif'), allowNull: false, defaultValue: 'rtsp' },
    stream_url: { type: DataTypes.STRING(255), allowNull: true },
    usuario_stream: { type: DataTypes.STRING(100), allowNull: true },
    clave_stream_cifrada: { type: DataTypes.STRING(255), allowNull: true },
    estado: { type: DataTypes.ENUM('activa', 'inactiva', 'mantenimiento', 'desconectada'), allowNull: false, defaultValue: 'activa' },
    fecha_instalacion: { type: DataTypes.DATEONLY, allowNull: true },
    ultima_conexion: { type: DataTypes.DATE, allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'camaras',
    freezeTableName: true,
    timestamps: false,
  });
  return Camaras;
};
