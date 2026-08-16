#!/usr/bin/env node
'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/models');

async function upsertUser({ email, password, nombre, apellido, rolCodigo, residencialId = null, telefono = null }) {
  const rol = await db.Roles.findOne({ where: { codigo: rolCodigo } });
  if (!rol) throw new Error(`No existe el rol ${rolCodigo}. Importa primero database/vigia_schema.sql.`);

  const password_hash = await bcrypt.hash(password, 12);
  const [usuario, created] = await db.Usuarios.findOrCreate({
    where: { email },
    defaults: {
      residencial_id: residencialId,
      rol_id: rol.id,
      nombre,
      apellido,
      email,
      telefono,
      password_hash,
      estado: 'activo',
      debe_cambiar_clave: false,
    },
  });

  if (!created) {
    await usuario.update({
      residencial_id: residencialId,
      rol_id: rol.id,
      nombre,
      apellido,
      telefono,
      password_hash,
      estado: 'activo',
      debe_cambiar_clave: false,
    });
  }
  return usuario;
}

async function main() {
  await db.sequelize.authenticate();

  const [residencial] = await db.Residenciales.findOrCreate({
    where: { nombre: 'Altavista Residencial' },
    defaults: {
      direccion: 'La Ceiba, Atlántida',
      ciudad: 'La Ceiba',
      pais: 'Honduras',
      zona_horaria: 'America/Tegucigalpa',
      activo: true,
    },
  });

  const [puntoAcceso] = await db.PuntosAcceso.findOrCreate({
    where: { residencial_id: residencial.id, nombre: 'Garita principal' },
    defaults: { tipo: 'mixto', activo: true },
  });

  await db.ConfiguracionesResidencial.findOrCreate({
    where: { residencial_id: residencial.id },
    defaults: { zona_horaria: 'America/Tegucigalpa', tiempo_objetivo_acceso_seg: 90, limite_cola_alerta: 5 },
  });

  const [vivienda] = await db.Viviendas.findOrCreate({
    where: { residencial_id: residencial.id, numero: '402' },
    defaults: { bloque_torre: 'Torre B', tipo: 'apartamento', activo: true },
  });

  const residente = await upsertUser({
    email: 'jorge.paz@correo.com',
    password: 'vigia123',
    nombre: 'Jorge',
    apellido: 'Paz',
    rolCodigo: 'residente',
    residencialId: residencial.id,
    telefono: '9999-0000',
  });
  await db.Residentes.findOrCreate({
    where: { usuario_id: residente.id },
    defaults: { vivienda_id: vivienda.id, tipo_residente: 'propietario', fecha_ingreso: new Date() },
  });

  const guardia = await upsertUser({
    email: 'jorge.reyes@vigia.com',
    password: 'vigia123',
    nombre: 'Jorge',
    apellido: 'Reyes',
    rolCodigo: 'guardia',
    residencialId: residencial.id,
    telefono: '9999-1111',
  });
  await db.Guardias.findOrCreate({
    where: { usuario_id: guardia.id },
    defaults: { residencial_id: residencial.id, numero_empleado: 'G-001', turno: 'nocturno' },
  });

  const admin = await upsertUser({
    email: 'admin@vigia.test',
    password: 'Vigia2026!',
    nombre: 'Admin',
    apellido: 'VIGIA',
    rolCodigo: 'admin',
    residencialId: residencial.id,
  });

  await upsertUser({
    email: 'superadmin@vigia.test',
    password: 'Vigia2026!',
    nombre: 'Super',
    apellido: 'Admin',
    rolCodigo: 'superadmin',
    residencialId: null,
  });

  await db.ContactosEmergencia.findOrCreate({
    where: { residencial_id: residencial.id, categoria: 'seguridad', nombre: 'Garita de seguridad' },
    defaults: { telefono: 'Ext. 101', disponible_24h: true, privado: false, orden_visual: 1, activo: true },
  });
  await db.ContactosEmergencia.findOrCreate({
    where: { residencial_id: residencial.id, categoria: 'administracion', nombre: 'Administración Altavista' },
    defaults: { telefono: 'Ext. 102', disponible_24h: false, privado: false, orden_visual: 2, activo: true },
  });

  const plan = await db.PlanesServicio.findOne({ where: { codigo: 'seguro' } });
  if (plan) {
    await db.Suscripciones.findOrCreate({
      where: { residencial_id: residencial.id, plan_id: plan.id },
      defaults: { estado: 'activa', fecha_inicio: new Date(), ciclo: 'mensual', precio_acordado: plan.precio_mensual },
    });
  }

  await db.Integraciones.findOrCreate({
    where: { residencial_id: residencial.id, nombre: 'Tranca principal — simulador' },
    defaults: { tipo: 'tranca', proveedor: 'Demostración VIGIA', modo: 'simulador', estado: 'activa', activo: true, configuracion_json: { punto_acceso_id: puntoAcceso.id } },
  });

  console.log('\nDatos de demostración creados o actualizados:\n');
  console.log('Residente:      jorge.paz@correo.com / vigia123');
  console.log('Guardia:        jorge.reyes@vigia.com / vigia123');
  console.log('Administrador:  admin@vigia.test / Vigia2026!');
  console.log('Superadmin:     superadmin@vigia.test / Vigia2026!');
  console.log('\nCambia estas contraseñas antes de publicar el sistema.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('No se pudieron crear los datos demo:', err.message);
    process.exit(1);
  });
