'use strict';
// Archivo generado automaticamente por scripts/generate-models.js
// a partir de database/vigia_schema.sql (tabla "cola_acceso").
// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".

module.exports = (sequelize, DataTypes) => {
  const ColaAcceso = sequelize.define('ColaAcceso', {
    id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
    residencial_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    punto_acceso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    invitacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    persona_autorizada_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    visitante_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre_persona: { type: DataTypes.STRING(180), allowNull: false },
    tipo_documento: { type: DataTypes.STRING(30), allowNull: true },
    numero_documento: { type: DataTypes.STRING(50), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    placa_vehiculo: { type: DataTypes.STRING(20), allowNull: true },
    foto_url: { type: DataTypes.TEXT('medium'), allowNull: true },
    motivo: { type: DataTypes.STRING(180), allowNull: true },
    vivienda_destino: { type: DataTypes.STRING(60), allowNull: true },
    origen_registro: { type: DataTypes.ENUM('qr', 'foto', 'documento', 'manual', 'offline', 'integracion'), allowNull: false, defaultValue: 'manual' },
    prioridad: { type: DataTypes.ENUM('normal', 'adulto_mayor', 'emergencia', 'servicio_esencial'), allowNull: false, defaultValue: 'normal' },
    estado: { type: DataTypes.ENUM('esperando', 'en_validacion', 'autorizada', 'bloqueada', 'rechazada', 'completada', 'cancelada'), allowNull: false, defaultValue: 'esperando' },
    resultado_validacion: { type: DataTypes.ENUM('pendiente', 'valida', 'veto', 'conflicto', 'fuera_horario', 'expirada', 'incompleta'), allowNull: false, defaultValue: 'pendiente' },
    guardia_original_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    guardia_actual_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    turno_guardia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_llegada: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_inicio_atencion: { type: DataTypes.DATE, allowNull: true },
    fecha_fin_atencion: { type: DataTypes.DATE, allowNull: true },
    observaciones: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'cola_acceso',
    freezeTableName: true,
    timestamps: false,
  });
  return ColaAcceso;
};
