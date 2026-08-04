#!/usr/bin/env node
'use strict';

/**
 * vigia_schema.sql ya siembra los roles/permisos, pero NO crea ningun
 * usuario (con buena razon: nunca se debe versionar una contraseña).
 * Sin al menos un usuario, es imposible hacer login la primera vez.
 *
 * Este script crea (si no existe) un usuario superadmin con contraseña
 * hasheada, para poder probar POST /api/auth/login de entrada.
 *
 * Uso:
 *   npm run seed:admin                  (password por defecto: Vigia2026!)
 *   npm run seed:admin -- MiClaveSegura (password custom)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/models');

async function main() {
  await db.sequelize.authenticate();

  const rolSuperadmin = await db.Roles.findOne({ where: { codigo: 'superadmin' } });
  if (!rolSuperadmin) {
    throw new Error(
      'No existe el rol "superadmin". Corre primero database/vigia_schema.sql completo (incluye los INSERT de datos semilla).'
    );
  }

  const passwordPlano = process.argv[2] || 'Vigia2026!';
  const password_hash = await bcrypt.hash(passwordPlano, 10);

  const [usuario, creado] = await db.Usuarios.findOrCreate({
    where: { email: 'superadmin@vigia.test' },
    defaults: {
      residencial_id: null,
      rol_id: rolSuperadmin.id,
      nombre: 'Super',
      apellido: 'Admin',
      password_hash,
      estado: 'activo',
      debe_cambiar_clave: true,
    },
  });

  if (creado) {
    console.log('Usuario superadmin creado.');
  } else {
    console.log('Ya existia un usuario con ese correo, no se toco.');
  }
  console.log('Email:   ', usuario.email);
  console.log('Password:', creado ? passwordPlano : '(sin cambios, no se conoce la contraseña actual)');
  process.exit(0);
}

main().catch((err) => {
  console.error('No se pudo crear el usuario superadmin:', err.message);
  process.exit(1);
});
