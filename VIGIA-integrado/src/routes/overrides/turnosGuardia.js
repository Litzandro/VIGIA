'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { TURNO_ESTADO, TURNO_ACCION, esAdmin, esSuperadmin, resolverResidencialId } = require('../../config/estados');

// Cuanto se le perdona a un guardia entre la hora programada de inicio
// y el momento en que pulsa "Iniciar" antes de considerarlo tarde en la
// UI (no cambia el estado, solo lo resalta -- ver AUSENTE_GRACIA_MIN mas
// abajo para cuando SI pasa a "ausente").
const TARDE_UMBRAL_MIN = 15;

async function decorate(rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.guardia_original_id, r.guardia_relevo_id]).filter(Boolean))];
  const users = ids.length ? await db.Usuarios.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nombre', 'apellido'] }) : [];
  const names = new Map(users.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  const plantillaIds = [...new Set(rows.map((r) => r.plantilla_id).filter(Boolean))];
  const plantillas = plantillaIds.length
    ? await db.PlantillasTurno.findAll({ where: { id: { [Op.in]: plantillaIds } }, attributes: ['id', 'nombre'] })
    : [];
  const nombrePlantilla = new Map(plantillas.map((p) => [String(p.id), p.nombre]));
  return rows.map((r) => {
    const data = r.toJSON();
    data.guardia_original_nombre = names.get(String(r.guardia_original_id)) || `Guardia #${r.guardia_original_id}`;
    data.guardia_relevo_nombre = r.guardia_relevo_id ? (names.get(String(r.guardia_relevo_id)) || `Guardia #${r.guardia_relevo_id}`) : null;
    data.plantilla_nombre = r.plantilla_id ? (nombrePlantilla.get(String(r.plantilla_id)) || null) : null;
    data.llego_tarde = Boolean(
      r.inicio_real && (new Date(r.inicio_real).getTime() - new Date(r.inicio_programado).getTime()) > TARDE_UMBRAL_MIN * 60 * 1000
    );
    return data;
  });
}

// Cuanto tiempo despues de la hora programada se espera antes de dar por
// ausente a un guardia que nunca pulso "Iniciar". Se aplica solo a
// turnos en estado "programado" -- uno que ya se inicio, releva o
// finalizo nunca se toca aca.
const AUSENTE_GRACIA_MIN = 30;

// No hay cron en el servidor (ver nota en database/vigia_schema.sql
// junto a CREATE TABLE plantillas_turno): esta funcion corre "al vuelo"
// cada vez que se pide GET /turnos-guardia de una residencial, y hace
// dos cosas antes de responder:
//   1) Genera las filas de turnos_guardia que falten desde las
//      plantillas activas (hoy y cualquier dia atrasado, hasta 7 dias
//      atras, por si nadie abrio esta pantalla en unos dias). Con mas de
//      un guardia en la plantilla, rota entre ellos en orden round-robin
//      mirando a quien le toco la ultima vez.
//   2) Marca como "ausente" cualquier turno programado cuya hora de
//      inicio ya paso hace mas de AUSENTE_GRACIA_MIN minutos sin que el
//      guardia pulsara "Iniciar".
const BACKFILL_DIAS = 7;

async function sincronizarTurnosDesdePlantillas(residencialId) {
  if (!residencialId) return;

  const plantillas = await db.PlantillasTurno.findAll({ where: { residencial_id: residencialId, activa: true } });
  if (plantillas.length) {
    const plantillaIds = plantillas.map((p) => p.id);
    const links = await db.PlantillaTurnoGuardias.findAll({
      where: { plantilla_id: { [Op.in]: plantillaIds } },
      order: [['orden', 'ASC']],
    });
    const guardiasPorPlantilla = new Map();
    links.forEach((g) => {
      const key = String(g.plantilla_id);
      if (!guardiasPorPlantilla.has(key)) guardiasPorPlantilla.set(key, []);
      guardiasPorPlantilla.get(key).push(g.guardia_id);
    });

    const hoy = new Date();
    const hoySoloFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    for (const plantilla of plantillas) {
      const guardiaIds = guardiasPorPlantilla.get(String(plantilla.id)) || [];
      if (!guardiaIds.length) continue;
      const dias = String(plantilla.dias_semana || '')
        .split(',')
        .map((d) => Number(d.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      if (!dias.length) continue;

      const ultimo = await db.TurnosGuardia.findOne({
        where: { plantilla_id: plantilla.id },
        order: [['inicio_programado', 'DESC']],
      });

      let cursor = new Date(hoySoloFecha);
      cursor.setDate(cursor.getDate() - BACKFILL_DIAS);
      if (ultimo) {
        const desdeUltimo = new Date(ultimo.inicio_programado);
        const desdeUltimoSoloFecha = new Date(desdeUltimo.getFullYear(), desdeUltimo.getMonth(), desdeUltimo.getDate() + 1);
        if (desdeUltimoSoloFecha > cursor) cursor = desdeUltimoSoloFecha;
      }

      let indiceRotacion = 0;
      if (ultimo) {
        const idxUltimo = guardiaIds.indexOf(ultimo.guardia_original_id);
        indiceRotacion = idxUltimo >= 0 ? (idxUltimo + 1) % guardiaIds.length : 0;
      }

      const [hIniH, hIniM] = String(plantilla.hora_inicio).split(':').map(Number);
      const [hFinH, hFinM] = String(plantilla.hora_fin).split(':').map(Number);

      while (cursor <= hoySoloFecha) {
        if (dias.includes(cursor.getDay())) {
          const inicio = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hIniH, hIniM, 0, 0);
          const yaExiste = await db.TurnosGuardia.findOne({ where: { plantilla_id: plantilla.id, inicio_programado: inicio } });
          if (!yaExiste) {
            let fin = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hFinH, hFinM, 0, 0);
            if (fin <= inicio) fin.setDate(fin.getDate() + 1); // turno nocturno que cruza medianoche
            await db.TurnosGuardia.create({
              residencial_id: plantilla.residencial_id,
              punto_acceso_id: plantilla.punto_acceso_id,
              plantilla_id: plantilla.id,
              guardia_original_id: guardiaIds[indiceRotacion],
              inicio_programado: inicio,
              fin_programado: fin,
              estado: TURNO_ESTADO.PROGRAMADO,
              observaciones: `Generado por plantilla: ${plantilla.nombre}`,
            });
            indiceRotacion = (indiceRotacion + 1) % guardiaIds.length;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  const limiteAusente = new Date(Date.now() - AUSENTE_GRACIA_MIN * 60 * 1000);
  await db.TurnosGuardia.update(
    { estado: TURNO_ESTADO.AUSENTE },
    { where: { residencial_id: residencialId, estado: TURNO_ESTADO.PROGRAMADO, inicio_programado: { [Op.lt]: limiteAusente } } }
  );
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

// Bitacora de turno (novedades y relevo). No se agrega una tabla nueva:
// se reusa "bitacora" (ya existe para el registro general de acciones,
// ver src/middlewares/bitacoraLogger.js) con modulo='turnos' y
// accion='novedad_turno', filtrando por entidad_afectada='turnos_guardia'
// + entidad_id=<id del turno>. Antes el guardia no tenia ningun lugar
// donde dejar constancia de novedades durante su turno o al entregarlo:
// "observaciones" del turno es un solo texto que solo administracion
// llena al programarlo, nunca durante el servicio.
async function decorateNovedades(rows) {
  const ids = [...new Set(rows.map((r) => r.usuario_id).filter(Boolean))];
  const usuarios = ids.length
    ? await db.Usuarios.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nombre', 'apellido'] })
    : [];
  const nombre = new Map(usuarios.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  return rows.map((r) => ({
    id: r.id,
    comentario: (r.detalles_json && r.detalles_json.comentario) || '',
    usuario_id: r.usuario_id,
    usuario_nombre: nombre.get(String(r.usuario_id)) || 'VIGIA',
    fecha_hora: r.fecha_hora,
  }));
}

module.exports = function turnosGuardiaOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (!esSuperadmin(req.user)) {
        where.residencial_id = req.user.residencial_id;
        await sincronizarTurnosDesdePlantillas(req.user.residencial_id);
      }
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

  // Historial de novedades de un turno especifico: lo que el guardia fue
  // anotando durante su jornada (rondas, visitas atendidas, algo que el
  // siguiente turno deba saber) mas cualquier nota de relevo.
  router.get(`/${pkPath}/bitacora`, async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const turno = await model.findOne({ where });
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
      const notas = await db.Bitacora.findAll({
        where: { entidad_afectada: 'turnos_guardia', entidad_id: turno.id, accion: 'novedad_turno' },
        order: [['fecha_hora', 'ASC']],
      });
      res.json({ data: await decorateNovedades(notas) });
    } catch (err) { next(err); }
  });

  // Agregar una novedad. PATCH (no POST) a proposito: en
  // resourcePermissions.js "create" en turnos_guardia exige el permiso
  // administrativo "turnos.gestionar" (que el guardia no tiene), mientras
  // que "update" es AUTH_ONLY -- cualquier autenticado, y aqui se valida a
  // mano que sea el guardia dueño del turno o administracion, igual que ya
  // hace /accion mas abajo.
  router.patch(`/${pkPath}/nota`, async (req, res, next) => {
    try {
      const comentario = String(req.body.comentario || '').trim();
      if (comentario.length < 3) return res.status(400).json({ error: 'Escribe la novedad (mínimo 3 caracteres).' });
      if (comentario.length > 500) return res.status(400).json({ error: 'La novedad admite hasta 500 caracteres.' });
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const turno = await model.findOne({ where });
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
      if (req.user.rol_codigo === 'guardia' && !esGuardiaDueñoDelTurno(req.user, turno)) {
        return res.status(403).json({ error: 'Este turno no te corresponde.' });
      }
      const fila = await db.Bitacora.create({
        residencial_id: turno.residencial_id,
        usuario_id: req.user.id,
        accion: 'novedad_turno',
        modulo: 'turnos',
        entidad_afectada: 'turnos_guardia',
        entidad_id: turno.id,
        detalles_json: { comentario },
      });
      res.status(201).json({ data: (await decorateNovedades([fila]))[0] });
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
