'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "contactos_emergencia").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ContactosEmergencia = sequelize.define('ContactosEmergencia', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    categoria: { type: DataTypes.ENUM('seguridad', 'medica', 'bomberos', 'administracion', 'familiar', 'otro'), allowNull: false },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    telefono: { type: DataTypes.STRING(30), allowNull: false },
    telefono_alterno: { type: DataTypes.STRING(30), allowNull: true },
    disponible_24h: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    privado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    orden_visual: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'contactos_emergencia',
    freezeTableName: true,
    timestamps: false,
  });
  return ContactosEmergencia;
};
