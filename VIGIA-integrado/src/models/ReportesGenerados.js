'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "reportes_generados").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ReportesGenerados = sequelize.define('ReportesGenerados', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo_reporte: { type: DataTypes.STRING(60), allowNull: false },
    parametros_json: { type: DataTypes.JSON, allowNull: true },
    archivo_url: { type: DataTypes.STRING(255), allowNull: true },
    fecha_generacion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'reportes_generados',
    freezeTableName: true,
    timestamps: false,
  });
  return ReportesGenerados;
};
