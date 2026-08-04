'use strict';

// Fabrica de controladores CRUD generica: dado cualquier modelo Sequelize
// (de src/models), devuelve los 5 handlers list/getOne/create/update/remove
// ya implementados. Esto es lo que permite que agregar una tabla nueva al
// esquema (y correr npm run generate:models) alcance para tener su propio
// endpoint REST, sin escribir un controlador por tabla a mano.
//
// Ademas de CRUD puro, aca vive el segundo nivel de seguridad multi-
// residencial: aunque un rol tenga permiso de sobra, no puede leer ni
// escribir datos de OTRA residencial (ni, si es residente, datos de
// OTRO residente) via estos endpoints genericos. El primer nivel
// (permisos/roles) lo aplica buildAccessMiddleware antes de llegar aca.

const RESERVED_QUERY_PARAMS = new Set(['page', 'limit', 'sort']);

function parsePagination(query) {
  const defaultSize = parseInt(process.env.DEFAULT_PAGE_SIZE, 10) || 20;
  const maxSize = parseInt(process.env.MAX_PAGE_SIZE, 10) || 100;

  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = defaultSize;
  if (limit > maxSize) limit = maxSize;

  return { page, limit, offset: (page - 1) * limit };
}

// ?sort=fecha_hora:desc  (solo permite ordenar por columnas reales del modelo,
// para no dejar pasar cualquier string crudo a la consulta SQL)
function parseSort(query, model) {
  if (!query.sort) return undefined;
  const [field, dirRaw] = String(query.sort).split(':');
  const direction = (dirRaw || 'ASC').toUpperCase();
  if (!model.rawAttributes[field]) return undefined;
  if (!['ASC', 'DESC'].includes(direction)) return undefined;
  return [[field, direction]];
}

// Filtros simples por igualdad: ?estado=activo&residencial_id=1
// Solo se aceptan columnas que existen de verdad en el modelo.
function buildFilters(query, model) {
  const where = {};
  Object.keys(query).forEach((key) => {
    if (RESERVED_QUERY_PARAMS.has(key)) return;
    if (!model.rawAttributes[key]) return;
    where[key] = query[key];
  });
  return where;
}

function hasSoftDelete(model) {
  return Boolean(model.rawAttributes.activo);
}

// Arma un WHERE de llave primaria a partir de los params de la ruta.
// Funciona igual para PK simple (:id) que para PK compuesta
// (:rol_id/:permiso_id en roles_permisos), usando model.primaryKeyAttributes
// que Sequelize ya calcula solo a partir de como se definio el modelo.
function primaryKeyWhere(model, params) {
  const where = {};
  model.primaryKeyAttributes.forEach((attr) => {
    where[attr] = params[attr];
  });
  return where;
}

// --- Scoping multi-tenant / multi-residente -------------------------
//
// Regla 1 (residencial): si el modelo tiene columna residencial_id y
// quien pide NO es superadmin, se fuerza ese filtro con el
// residencial_id que vino en el token. En creaciones, se ignora
// cualquier residencial_id que mande el cliente y se usa el del token
// (evita que alguien inyecte datos en otra residencial mandando un id
// distinto a mano).
//
// Regla 2 (residente): si el modelo tiene columna residente_id y quien
// pide tiene rol "residente", se aplica el mismo criterio pero con su
// propio id de residente (que es el mismo que su usuario_id, porque
// residentes.usuario_id es a la vez PK y FK a usuarios).
//
// Regla 3 (notificaciones): caso especial. Una notificacion es
// inherentemente personal; nadie que no sea admin/superadmin deberia
// poder listar las de otro usuario aunque tenga permiso de lectura.
function applyOwnershipScope(model, user, where) {
  if (!user) return where;
  const scoped = { ...where };

  if (user.rol_codigo !== 'superadmin' && model.rawAttributes.residencial_id) {
    scoped.residencial_id = user.residencial_id;
  }

  if (user.rol_codigo === 'residente' && model.rawAttributes.residente_id) {
    scoped.residente_id = user.id;
  }

  if (model.getTableName() === 'notificaciones' && !['admin', 'superadmin'].includes(user.rol_codigo)) {
    scoped.usuario_id = user.id;
  }

  return scoped;
}

function applyOwnershipOnCreate(model, user, body) {
  if (!user) return body;
  const data = { ...body };

  if (user.rol_codigo !== 'superadmin' && model.rawAttributes.residencial_id) {
    data.residencial_id = user.residencial_id;
  }

  if (user.rol_codigo === 'residente' && model.rawAttributes.residente_id) {
    data.residente_id = user.id;
  }

  return data;
}

function createCrudHandlers(model) {
  return {
    async list(req, res, next) {
      try {
        const { page, limit, offset } = parsePagination(req.query);
        const order = parseSort(req.query, model);
        let where = buildFilters(req.query, model);
        where = applyOwnershipScope(model, req.user, where);

        const { rows, count } = await model.findAndCountAll({ where, limit, offset, order });

        res.json({
          data: rows,
          meta: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
        });
      } catch (err) {
        next(err);
      }
    },

    async getOne(req, res, next) {
      try {
        let where = primaryKeyWhere(model, req.params);
        where = applyOwnershipScope(model, req.user, where);
        const row = await model.findOne({ where });
        if (!row) return res.status(404).json({ error: `${model.name} no encontrado` });
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const data = applyOwnershipOnCreate(model, req.user, req.body || {});
        const row = await model.create(data);
        res.status(201).json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async update(req, res, next) {
      try {
        let where = primaryKeyWhere(model, req.params);
        where = applyOwnershipScope(model, req.user, where);
        const row = await model.findOne({ where });
        if (!row) return res.status(404).json({ error: `${model.name} no encontrado` });
        await row.update(req.body || {});
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    // Borrado logico automatico si el modelo tiene columna "activo"
    // (asi quedo definido en el esquema para las tablas maestras).
    // Si no la tiene (tablas puramente transaccionales/historicas como
    // accesos o bitacora), se hace DELETE fisico normal.
    async remove(req, res, next) {
      try {
        let where = primaryKeyWhere(model, req.params);
        where = applyOwnershipScope(model, req.user, where);
        const row = await model.findOne({ where });
        if (!row) return res.status(404).json({ error: `${model.name} no encontrado` });

        if (hasSoftDelete(model)) {
          const patch = { activo: false };
          if (model.rawAttributes.fecha_eliminacion) patch.fecha_eliminacion = new Date();
          await row.update(patch);
          return res.json({ data: row, mensaje: 'Registro desactivado (borrado logico)' });
        }

        await row.destroy();
        return res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

// Cablea las 6 rutas REST estandar sobre un router ya creado. Los
// overrides (src/routes/overrides/*.js) lo usan para las verbos que no
// necesitan cambiar, y agregan/reemplazan el resto a mano.
function attachStandardCrud(router, handlers, pkPath) {
  router.get('/', handlers.list);
  router.post('/', handlers.create);
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
}

module.exports = {
  createCrudHandlers,
  attachStandardCrud,
  parsePagination,
  parseSort,
  buildFilters,
  hasSoftDelete,
  primaryKeyWhere,
  applyOwnershipScope,
  applyOwnershipOnCreate,
};
