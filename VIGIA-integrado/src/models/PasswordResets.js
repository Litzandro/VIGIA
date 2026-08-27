'use strict';
// A diferencia de la mayoria de archivos en esta carpeta, este NO lo
// genero scripts/generate-models.js (ese script lee database/vigia_schema.sql
// y en este entregable no se pudo volver a correr contra una base real).
// Se agrego a mano siguiendo exactamente el mismo formato que los demas
// modelos generados, para que src/models/index.js lo recoja solo (escanea
// todos los .js de esta carpeta). Si mas adelante se corre
// "npm run generate:models", este archivo se puede reemplazar por la
// version auto-generada sin perder nada (misma tabla, mismas columnas).

module.exports = (sequelize, DataTypes) => {
  const PasswordResets = sequelize.define('PasswordResets', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false },
    ip_origen: { type: DataTypes.STRING(45), allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_expiracion: { type: DataTypes.DATE, allowNull: false },
    usado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'password_resets',
    freezeTableName: true,
    timestamps: false,
  });
  return PasswordResets;
};
