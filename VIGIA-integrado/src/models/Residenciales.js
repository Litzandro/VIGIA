'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "residenciales").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const Residenciales = sequelize.define('Residenciales', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    direccion: { type: DataTypes.STRING(255), allowNull: true },
    ciudad: { type: DataTypes.STRING(100), allowNull: true },
    pais: { type: DataTypes.STRING(100), allowNull: true },
    telefono_contacto: { type: DataTypes.STRING(30), allowNull: true },
    email_contacto: { type: DataTypes.STRING(150), allowNull: true },
    zona_horaria: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'America/Guatemala' },
    logo_url: { type: DataTypes.STRING(255), allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_actualizacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_eliminacion: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'residenciales',
    freezeTableName: true,
    timestamps: false,
  });
  return Residenciales;
};
