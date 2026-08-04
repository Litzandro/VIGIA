'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "usuarios").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Usuarios = sequelize.define('Usuarios', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    rol_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    apellido: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    foto_url: { type: DataTypes.STRING(255), allowNull: true },
    estado: { type: DataTypes.ENUM('activo', 'inactivo', 'suspendido'), allowNull: false, defaultValue: 'activo' },
    debe_cambiar_clave: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ultimo_acceso: { type: DataTypes.DATE, allowNull: true },
    creado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_actualizacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_eliminacion: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'usuarios',
    freezeTableName: true,
    timestamps: false,
  });
  return Usuarios;
};
