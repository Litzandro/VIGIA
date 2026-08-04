'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "dispositivos_usuario").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const DispositivosUsuario = sequelize.define('DispositivosUsuario', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    identificador: { type: DataTypes.STRING(180), allowNull: false },
    plataforma: { type: DataTypes.STRING(80), allowNull: true },
    biometria_disponible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    biometria_habilitada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    confiable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    revocado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ultimo_uso: { type: DataTypes.DATE, allowNull: true },
    fecha_registro: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'dispositivos_usuario',
    freezeTableName: true,
    timestamps: false,
  });
  return DispositivosUsuario;
};
