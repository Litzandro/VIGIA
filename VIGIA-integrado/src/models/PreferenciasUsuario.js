'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "preferencias_usuario").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const PreferenciasUsuario = sequelize.define('PreferenciasUsuario', {
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true },
    tema: { type: DataTypes.ENUM('claro', 'suave', 'oscuro', 'alto_contraste'), allowNull: false, defaultValue: 'suave' },
    filtro_color: { type: DataTypes.ENUM('ninguno', 'escala_grises', 'deuteranopia', 'protanopia', 'tritanopia'), allowNull: false, defaultValue: 'ninguno' },
    tamano_texto: { type: DataTypes.ENUM('normal', 'grande', 'extra_grande'), allowNull: false, defaultValue: 'normal' },
    modo_simple: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lectura_asistida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reducir_movimiento: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    biometria_preferida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_actualizacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'preferencias_usuario',
    freezeTableName: true,
    timestamps: false,
  });
  return PreferenciasUsuario;
};
