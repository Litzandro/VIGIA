'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { TURNO_ESTADO, TURNO_ACCION, esAdmin, esSuperadmin, resolverResidencialId } = require('../../config/estados');

async function decorate(rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.guardia_original_id, r.guardia_relevo_id]).filter(Boolean))];
  const users = ids.length ? await db.Usuarios.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nombre', 'apellido'] }) : [];
  const names = new Map(users.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  return rows.map((r) => {
    const data = r.toJSON();
    data.guardia_original_nombre = names.get(String(r.guardia_original_id)) || `Guardia #${r.guardia_original_id}`;
    data.guardia_relevo_nombre = r.guardia_relevo_id ? (names.get(String(r.guardia_relevo_id)) || `Guardia #${r.guardia_relevo_id}`) : null;
    return data;
  });
}

// Regla de negocio: un guardia solo puede iniciar/finalizar un turno que
// le pertenece (como titular o como relevo). Antes esta condicion estaba
// escrita dos veces, una por cada accion ("iniciar" y "finalizar"), con el
// mismo .map(String).includes(String(...)) copiado y pegado. Si mañana se
// agrega una tercera accion con la misma restriccion, se corre el riesgo
// de copiar mal la condicion una vez mas. Con la regla en un solo lugar,
// agregar una accion nueva es una linea, no una condicion nueva a mantener
// sincronizada.
function esGuardiaDueñoDelTurno(user, turno) {
  const idsDelTurno = [turno.guardia_original_id, turno.guardia_relevo_id].map(String);
  return idsDelTurno.includes(String(user.id));
}

// Cada accion valida sus propios permisos y calcula el patch a aplicar.
// Antes esto era un if/else if/else encadenado dentro de un mismo bloque:
// funcionaba, pero mezclaba la autorizacion de las 3 acciones en un solo
// lugar y hacia crecer una sola funcion cada vez que se agregaba una
// accion nueva. Como tabla de funciones, agregar una accion es agregar
// una entrada nueva sin tocar las que ya existen (menor riesgo de romper
// una accion existente al modificar otra).
const ACCIONES_TURNO = {
  [TURNO_ACCION.INICIAR](req, row) {
    if (req.user.rol_codigo === 'guardia' && !esGuardiaDueñoDelTurno(req.user, row)) {
      return { error: { status: 403, body: { error: 'Este turno no te corresponde.' } } };
    }
    return { patch: { estado: TURNO_ESTADO.ACTIVO, inicio_real: new Date() } };
  },

  [TURNO_ACCION.RELEVAR](req, row) {
    if (!esAdmin(req.user)) {
      return { error: { status: 403, body: { error: 'Solo administración registra relevos.' } } };
    }
    if (!req.body.guardia_relevo_id) {
      return { error: { status: 400, body: { error: 'Selecciona el guardia de relevo.' } } };
    }
    return {
      patch: {
        estado: TURNO_ESTADO.RELEVADO,
        guardia_relevo_id: req.body.guardia_relevo_id,
        observaciones: req.body.observaciones || row.observaciones,
      },
    };
  },

  [TURNO_ACCION.FINALIZAR](req, row) {
    if (req.user.rol_codigo === 'guardia' && !esGuardiaDueñoDelTurno(req.user, row)) {
      return { error: { status: 403, body: { error: 'Este turno no te corresponde.' } } };
    }
    return { patch: { estado: TURNO_ESTADO.FINALIZADO, fin_real: new Date() } };
  },
};

module.exports = function turnosGuardiaOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'guardia') {
        where[Op.or] = [{ guardia_original_id: req.user.id }, { guardia_relevo_id: req.user.id }];
      }
      if (req.query.estado) where.estado = req.query.estado;
      const rows = await model.findAll({ where, order: [['inicio_programado', 'DESC']], limit: 200 });
      res.json({ data: await decorate(rows), meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) return res.status(403).json({ error: 'Solo administración programa jornadas.' });

      const start = new Date(req.body.inicio_programado);
      const end = new Date(req.body.fin_programado);
      if (!req.body.guardia_original_id) {
        return res.status(400).json({ error: 'Selecciona un guardia.' });
      }
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Indica un horario de inicio y fin válido.' });
      }
      if (end <= start) {
        return res.status(400).json({ error: 'El fin del turno debe ser posterior al inicio.' });
      }

      const row = await model.create({
        residencial_id: resolverResidencialId(req.user, req.body),
        punto_acceso_id: req.body.punto_acceso_id || null,
        guardia_original_id: req.body.guardia_original_id,
        guardia_relevo_id: req.body.guardia_relevo_id || null,
        inicio_programado: start,
        fin_programado: end,
        estado: req.body.estado || TURNO_ESTADO.PROGRAMADO,
        observaciones: req.body.observaciones || null,
      });
      res.status(201).json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}/accion`, async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Turno no encontrado.' });

      const manejador = ACCIONES_TURNO[req.body.accion];
      if (!manejador) return res.status(400).json({ error: 'Acción inválida.' });

      const resultado = manejador(req, row);
      if (resultado.error) return res.status(resultado.error.status).json(resultado.error.body);

      await row.update(resultado.patch);
      res.json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, handlers.getOne);
  const adminUpdate = async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) return res.status(403).json({ error: 'Solo administración edita jornadas directamente.' });
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Turno no encontrado.' });
      const allowed = {};
      ['punto_acceso_id','guardia_original_id','guardia_relevo_id','inicio_programado','fin_programado','estado','observaciones'].forEach(k=>{if(req.body[k]!==undefined)allowed[k]=req.body[k]});
      await row.update(allowed);
      res.json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, adminUpdate);
  router.patch(`/${pkPath}`, adminUpdate);
  router.delete(`/${pkPath}`, handlers.remove);
};

// Se exponen para poder probar la regla de negocio sin levantar servidor
// ni base de datos (ver tests/turnosGuardia.reglas.test.js).
module.exports.esGuardiaDueñoDelTurno = esGuardiaDueñoDelTurno;
module.exports.ACCIONES_TURNO = ACCIONES_TURNO;
