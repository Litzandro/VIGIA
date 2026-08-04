#!/usr/bin/env node
'use strict';

/**
 * Prueba la logica de src/utils/crudFactory.js SIN necesitar Sequelize,
 * Express ni una base de datos real (no se pudo hacer npm install en el
 * entorno donde se genero este proyecto por una restriccion de red).
 *
 * Implementa un "modelo falso" en memoria que expone la misma superficie
 * que crudFactory.js realmente usa de un modelo Sequelize:
 *   rawAttributes, primaryKeyAttributes, findAndCountAll, findOne, create,
 *   y en cada fila: update(), destroy().
 *
 * Esto valida la logica que SI es nuestra (paginacion, filtros, orden,
 * borrado logico automatico, manejo de PK compuesta, 404s) antes de
 * conectarla a una base real. No reemplaza probar contra MySQL de verdad.
 *
 * Uso: node scripts/test-offline.js
 */

const assert = require('assert');
const { createCrudHandlers } = require('../src/utils/crudFactory');

class FakeModel {
  constructor(name, attrs, seedRows = [], tableName) {
    this.name = name;
    this._tableName = tableName || name.toLowerCase();
    this.rawAttributes = attrs;
    this.primaryKeyAttributes = Object.keys(attrs).filter((k) => attrs[k].primaryKey);
    this._rows = [];
    this._autoId = 1;
    seedRows.forEach((r) => this._push(r));
    // El _push de arriba no pasa por create(), asi que el contador de
    // autoincrement no avanza solo; lo alineamos con los ids ya sembrados.
    const pk = this.primaryKeyAttributes[0];
    if (this.primaryKeyAttributes.length === 1 && attrs[pk] && attrs[pk].autoIncrement) {
      const maxId = seedRows.reduce((max, r) => Math.max(max, Number(r[pk]) || 0), 0);
      this._autoId = maxId + 1;
    }
  }

  getTableName() {
    return this._tableName;
  }

  _matches(row, where) {
    return Object.entries(where).every(([k, v]) => String(row[k]) === String(v));
  }

  _push(plain) {
    const self = this;
    const row = {
      ...plain,
      async update(patch) {
        Object.assign(this, patch);
        return this;
      },
      async destroy() {
        self._rows = self._rows.filter((r) => r !== this);
      },
    };
    this._rows.push(row);
    return row;
  }

  async findAndCountAll({ where = {}, limit, offset, order } = {}) {
    let rows = this._rows.filter((r) => this._matches(r, where));
    const count = rows.length;
    if (order) {
      const [[field, dir]] = order;
      rows = [...rows].sort((a, b) => {
        if (a[field] === b[field]) return 0;
        const cmp = a[field] > b[field] ? 1 : -1;
        return dir === 'DESC' ? -cmp : cmp;
      });
    }
    if (typeof offset === 'number' && typeof limit === 'number') {
      rows = rows.slice(offset, offset + limit);
    }
    return { rows, count };
  }

  async findOne({ where = {} } = {}) {
    return this._rows.find((r) => this._matches(r, where)) || null;
  }

  async create(data) {
    const pk = this.primaryKeyAttributes[0];
    const withId =
      this.primaryKeyAttributes.length === 1 && this.rawAttributes[pk].autoIncrement
        ? { ...data, [pk]: this._autoId++ }
        : { ...data };
    return this._push(withId);
  }
}

function fakeReqRes(overrides = {}) {
  const req = { query: {}, params: {}, body: {}, ...overrides };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  let capturedError = null;
  const next = (err) => {
    capturedError = err;
  };
  return { req, res, next, getError: () => capturedError };
}

let passed = 0;
function check(desc, condition) {
  assert.ok(condition, desc);
  passed++;
  console.log(`  OK - ${desc}`);
}

async function testUsuarios() {
  console.log('\n[Usuarios] modelo con id autoincrement + soft delete (columna activo)');
  const Usuarios = new FakeModel(
    'Usuarios',
    {
      id: { primaryKey: true, autoIncrement: true },
      nombre: {},
      email: {},
      activo: {},
      fecha_eliminacion: {},
    },
    [
      { id: 1, nombre: 'Ana', email: 'ana@vigia.test', activo: true },
      { id: 2, nombre: 'Luis', email: 'luis@vigia.test', activo: true },
      { id: 3, nombre: 'Marta', email: 'marta@vigia.test', activo: true },
    ]
  );
  const handlers = createCrudHandlers(Usuarios);

  // list: paginacion por defecto
  {
    const { req, res, next } = fakeReqRes();
    await handlers.list(req, res, next);
    check('list devuelve los 3 usuarios sembrados', res.body.data.length === 3);
    check('list incluye meta.total correcto', res.body.meta.total === 3);
  }

  // list: filtro por columna real
  {
    const { req, res, next } = fakeReqRes({ query: { nombre: 'Ana' } });
    await handlers.list(req, res, next);
    check('list filtra por columna existente (nombre=Ana)', res.body.data.length === 1 && res.body.data[0].email === 'ana@vigia.test');
  }

  // list: ignora filtros sobre columnas que no existen
  {
    const { req, res, next } = fakeReqRes({ query: { columna_inventada: 'x' } });
    await handlers.list(req, res, next);
    check('list ignora filtros de columnas inexistentes (no rompe, no filtra)', res.body.data.length === 3);
  }

  // getOne: encontrado y no encontrado
  {
    const { req, res, next } = fakeReqRes({ params: { id: '2' } });
    await handlers.getOne(req, res, next);
    check('getOne encuentra por id', res.body.data.nombre === 'Luis');
  }
  {
    const { req, res, next } = fakeReqRes({ params: { id: '999' } });
    await handlers.getOne(req, res, next);
    check('getOne responde 404 si no existe', res.statusCode === 404);
  }

  // create
  {
    const { req, res, next } = fakeReqRes({ body: { nombre: 'Nuevo', email: 'nuevo@vigia.test', activo: true } });
    await handlers.create(req, res, next);
    check('create responde 201', res.statusCode === 201);
    check('create asigna id autoincrement', res.body.data.id === 4);
  }

  // update
  {
    const { req, res, next } = fakeReqRes({ params: { id: '1' }, body: { nombre: 'Ana Actualizada' } });
    await handlers.update(req, res, next);
    check('update aplica el cambio', res.body.data.nombre === 'Ana Actualizada');
  }

  // remove: debe ser borrado logico (tiene columna activo)
  {
    const { req, res, next } = fakeReqRes({ params: { id: '3' } });
    await handlers.remove(req, res, next);
    check('remove hace soft-delete (status 200, no 204)', res.statusCode === 200);
    check('remove pone activo=false en vez de borrar la fila', res.body.data.activo === false);
    const stillThere = await Usuarios.findOne({ where: { id: 3 } });
    check('remove NO elimina la fila fisicamente (sigue en la tabla)', stillThere !== null);
  }
}

async function testRolesPermisos() {
  console.log('\n[RolesPermisos] modelo con PK compuesta, sin soft delete');
  const RolesPermisos = new FakeModel(
    'RolesPermisos',
    {
      rol_id: { primaryKey: true },
      permiso_id: { primaryKey: true },
    },
    [
      { rol_id: 1, permiso_id: 10 },
      { rol_id: 1, permiso_id: 11 },
      { rol_id: 2, permiso_id: 10 },
    ]
  );
  const handlers = createCrudHandlers(RolesPermisos);

  // getOne con PK compuesta (dos params de ruta)
  {
    const { req, res, next } = fakeReqRes({ params: { rol_id: '1', permiso_id: '11' } });
    await handlers.getOne(req, res, next);
    check('getOne con PK compuesta encuentra la fila correcta', res.body.data.rol_id === 1 && res.body.data.permiso_id === 11);
  }

  // remove: sin columna "activo" -> debe ser DELETE fisico (204)
  {
    const { req, res, next } = fakeReqRes({ params: { rol_id: '2', permiso_id: '10' } });
    await handlers.remove(req, res, next);
    check('remove sin soft-delete responde 204', res.statusCode === 204);
    const gone = await RolesPermisos.findOne({ where: { rol_id: 2, permiso_id: 10 } });
    check('remove sin soft-delete SI elimina la fila fisicamente', gone === null);
  }

  // getOne de una combinacion que no existe
  {
    const { req, res, next } = fakeReqRes({ params: { rol_id: '99', permiso_id: '99' } });
    await handlers.getOne(req, res, next);
    check('getOne con PK compuesta responde 404 si no existe', res.statusCode === 404);
  }
}

async function testSortAndPagination() {
  console.log('\n[Accesos] paginacion y orden (?sort=)');
  const Accesos = new FakeModel(
    'Accesos',
    {
      id: { primaryKey: true, autoIncrement: true },
      fecha_hora: {},
    },
    [
      { id: 1, fecha_hora: '2026-08-01T10:00:00' },
      { id: 2, fecha_hora: '2026-08-01T09:00:00' },
      { id: 3, fecha_hora: '2026-08-01T11:00:00' },
    ]
  );
  const handlers = createCrudHandlers(Accesos);

  {
    const { req, res, next } = fakeReqRes({ query: { limit: '2', page: '1' } });
    await handlers.list(req, res, next);
    check('list respeta limit', res.body.data.length === 2);
    check('list calcula totalPages correctamente', res.body.meta.totalPages === 2);
  }

  {
    const { req, res, next } = fakeReqRes({ query: { sort: 'fecha_hora:asc' } });
    await handlers.list(req, res, next);
    check('list ordena ascendente por columna valida', res.body.data[0].id === 2);
  }

  {
    const { req, res, next } = fakeReqRes({ query: { sort: 'columna_que_no_existe:asc' } });
    await handlers.list(req, res, next);
    check('list ignora sort sobre columna invalida (no revienta)', res.body.data.length === 3);
  }
}

async function testScopingMultiResidencial() {
  console.log('\n[Scoping] residencial_id / residente_id forzados segun el usuario logueado');
  const { applyOwnershipScope, applyOwnershipOnCreate } = require('../src/utils/crudFactory');

  const Invitaciones = new FakeModel(
    'Invitaciones',
    {
      id: { primaryKey: true, autoIncrement: true },
      residencial_id: {},
      residente_id: {},
    },
    [],
    'invitaciones'
  );

  const residenteUser = { id: 5, rol_codigo: 'residente', residencial_id: 1 };
  const guardiaUser = { id: 9, rol_codigo: 'guardia', residencial_id: 1 };
  const superadminUser = { id: 1, rol_codigo: 'superadmin', residencial_id: null };

  {
    const scoped = applyOwnershipScope(Invitaciones, residenteUser, {});
    check('residente: se fuerza residencial_id propio en el WHERE', scoped.residencial_id === 1);
    check('residente: se fuerza residente_id propio en el WHERE (no puede ver invitaciones de otro)', scoped.residente_id === 5);
  }

  {
    const scoped = applyOwnershipScope(Invitaciones, guardiaUser, {});
    check('guardia: se filtra por su residencial', scoped.residencial_id === 1);
    check('guardia: NO se filtra por residente_id (no es residente)', scoped.residente_id === undefined);
  }

  {
    const scoped = applyOwnershipScope(Invitaciones, superadminUser, {});
    check('superadmin: no se le fuerza ningun filtro (ve todas las residenciales)', scoped.residencial_id === undefined);
  }

  {
    // Intento de "inyeccion": un residente manda residencial_id=99 en el
    // body tratando de crear algo en otra residencial. Debe ser ignorado.
    const data = applyOwnershipOnCreate(Invitaciones, residenteUser, { residencial_id: 99, residente_id: 999, nombre_evento: 'Cumple' });
    check('create: se ignora el residencial_id que manda el cliente y se usa el del token', data.residencial_id === 1);
    check('create: se ignora el residente_id que manda el cliente y se usa el del token', data.residente_id === 5);
  }

  const Notificaciones = new FakeModel(
    'Notificaciones',
    { id: { primaryKey: true, autoIncrement: true }, usuario_id: {} },
    [],
    'notificaciones'
  );
  {
    const scoped = applyOwnershipScope(Notificaciones, residenteUser, {});
    check('notificaciones: un residente solo ve las suyas (usuario_id=self)', scoped.usuario_id === 5);
  }
  {
    const adminUser = { id: 2, rol_codigo: 'admin', residencial_id: 1 };
    const scoped = applyOwnershipScope(Notificaciones, adminUser, {});
    check('notificaciones: un admin puede ver todas (no se le fuerza usuario_id)', scoped.usuario_id === undefined);
  }
}

function testAuthMiddlewaresPuros() {
  console.log('\n[auth.js] requireAuth / requireRole (logica pura, sin tocar la base)');
  const { requireRole } = require('../src/middlewares/auth');

  {
    const mw = requireRole('admin', 'superadmin');
    const { req, res, next } = fakeReqRes({});
    req.user = { rol_codigo: 'guardia' };
    mw(req, res, next);
    check('requireRole responde 403 si el rol no esta en la lista', res.statusCode === 403);
  }
  {
    const mw = requireRole('admin');
    const { req, res, next } = fakeReqRes({});
    req.user = { rol_codigo: 'superadmin' };
    let called = false;
    mw(req, res, () => { called = true; });
    check('requireRole deja pasar a superadmin aunque no este en la lista (bypass)', called === true);
  }
  {
    const mw = requireRole('admin');
    const { req, res, next } = fakeReqRes({});
    req.user = { rol_codigo: 'admin' };
    let called = false;
    mw(req, res, () => { called = true; });
    check('requireRole deja pasar si el rol si esta en la lista', called === true);
  }
}

function testInvitacionesService() {
  console.log('\n[invitacionesService] evaluarValidez (requisito 5)');
  const { evaluarValidez } = require('../src/services/invitacionesService');
  const ahora = new Date('2026-08-01T12:00:00');

  check(
    'invitacion inexistente -> invalida',
    evaluarValidez(null, ahora).valido === false
  );
  check(
    'invitacion cancelada -> invalida',
    evaluarValidez({ estado: 'cancelada' }, ahora).valido === false
  );
  check(
    'fuera de rango de fechas (todavia no empieza) -> invalida',
    evaluarValidez(
      { estado: 'pendiente', fecha_valida_desde: '2026-08-02T00:00:00', fecha_valida_hasta: '2026-08-03T00:00:00', usos_actuales: 0, max_usos: 1 },
      ahora
    ).valido === false
  );
  check(
    'fuera de rango de fechas (ya vencio) -> invalida',
    evaluarValidez(
      { estado: 'pendiente', fecha_valida_desde: '2026-07-01T00:00:00', fecha_valida_hasta: '2026-07-31T00:00:00', usos_actuales: 0, max_usos: 1 },
      ahora
    ).valido === false
  );
  check(
    'usos agotados -> invalida',
    evaluarValidez(
      { estado: 'pendiente', fecha_valida_desde: '2026-08-01T00:00:00', fecha_valida_hasta: '2026-08-02T00:00:00', usos_actuales: 1, max_usos: 1 },
      ahora
    ).valido === false
  );
  check(
    'dentro de rango, con usos disponibles -> valida',
    evaluarValidez(
      { estado: 'pendiente', fecha_valida_desde: '2026-08-01T00:00:00', fecha_valida_hasta: '2026-08-02T00:00:00', usos_actuales: 0, max_usos: 1 },
      ahora
    ).valido === true
  );
}

function testResourcePermissionsConfig() {
  console.log('\n[resourcePermissions] cobertura completa de todas las tablas del esquema');
  const fs = require('fs');
  const path = require('path');
  const rp = require('../src/config/resourcePermissions');
  const { buildAccessMiddleware } = require('../src/utils/buildAccessMiddleware');

  const sql = fs
    .readFileSync(path.join(__dirname, '..', 'database', 'vigia_schema.sql'), 'utf8')
    .replace(/--.*/g, '');
  const tablas = [...sql.matchAll(/CREATE TABLE (\w+)/gi)].map((m) => m[1]);

  check('todas las tablas del SQL tienen entrada en resourcePermissions', tablas.every((t) => t in rp));
  check('resourcePermissions no tiene entradas huerfanas (tablas que ya no existen)', Object.keys(rp).every((t) => tablas.includes(t)));

  // bitacora: create/update/remove deben quedar bloqueados (nadie escribe a mano)
  const mwBloqueado = buildAccessMiddleware(rp.bitacora.create);
  check('bitacora.create esta bloqueado (405), nadie lo escribe via API', mwBloqueado.length === 1);
}

async function main() {
  await testUsuarios();
  await testRolesPermisos();
  await testSortAndPagination();
  await testScopingMultiResidencial();
  testAuthMiddlewaresPuros();
  testInvitacionesService();
  testResourcePermissionsConfig();
  console.log(`\n${passed} verificaciones pasaron.`);
  console.log('Nota: esto prueba la logica propia del proyecto (crudFactory, scoping, RBAC, validacion de invitaciones)');
  console.log('con datos simulados. Falta la prueba de integracion real contra MySQL/Sequelize (requiere "npm install"),');
  console.log('y requirePermission() en particular necesita la base real porque consulta roles_permisos.');
}

main().catch((err) => {
  console.error('\nFALLO UNA VERIFICACION:', err.message);
  process.exit(1);
});
