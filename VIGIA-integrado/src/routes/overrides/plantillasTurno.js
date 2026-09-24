'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { esAdmin, esSuperadmin, resolverResidencialId } = require('../../config/estados');
const { requiereNivelPlan } = require('../../utils/planAcceso');

const DIA_VALIDO = new Set([0, 1, 2, 3, 4, 5, 6]);

function parseDiasSemana(value) {
  const dias = Array.isArray(value)
    ? value.map(Number)
    : String(value || '').split(',').map((d) => Number(d.trim()));
  const limpios = [...new Set(dias.filter((d) => DIA_VALIDO.has(d)))].sort((a, b) => a - b);
  return limpios;
}

function parseHora(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

async function decorate(rows) {
  const ids = rows.map((r) => r.id);
  const guardiasLinks = ids.length
    ? await db.PlantillaTurnoGuardias.findAll({ where: { plantilla_id: { [Op.in]: ids } }, order: [['orden', 'ASC']] })
    : [];
  const guardiaIds = [...new Set(guardiasLinks.map((g) => g.guardia_id))];
  const usuarios = guardiaIds.length
    ? await db.Usuarios.findAll({ where: { id: { [Op.in]: guardiaIds } }, attributes: ['id', 'nombre', 'apellido'] })
    : [];
  const nombre = new Map(usuarios.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  const porPlantilla = new Map();
  guardiasLinks.forEach((g) => {
    const key = String(g.plantilla_id);
    if (!porPlantilla.has(key)) porPlantilla.set(key, []);
    porPlantilla.get(key).push({ id: g.guardia_id, nombre: nombre.get(String(g.guardia_id)) || `Guardia #${g.guardia_id}` });
  });
  return rows.map((r) => {
    const data = r.toJSON();
    data.dias_semana_lista = parseDiasSemana(r.dias_semana);
    data.guardias = porPlantilla.get(String(r.id)) || [];
    return data;
  });
}

// Reemplaza por completo la lista de guardias de una plantilla (borra e
// inserta de nuevo, en el orden recibido). Se hace asi -- en vez de un
// diff fila por fila -- porque la lista rara vez pasa de 3-4 guardias y
// el caso de uso normal es "cambia quien esta en la rotacion", no un
// ajuste incremental de una lista larga.
async function reemplazarGuardias(plantillaId, guardiaIds) {
  await db.PlantillaTurnoGuardias.destroy({ where: { plantilla_id: plantillaId } });
  const filas = guardiaIds.map((guardia_id, index) => ({ plantilla_id: plantillaId, guardia_id, orden: index }));
  if (filas.length) await db.PlantillaTurnoGuardias.bulkCreate(filas);
}

module.exports = function plantillasTurnoOverride({ router, model, handlers, pkPath }) {
  // Parte de "Operación" -- mismo requisito de plan que turnos_guardia.
  router.use(requiereNivelPlan(2));

  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      if (req.query.activa !== undefined) where.activa = req.query.activa === 'true' || req.query.activa === '1';
      const rows = await model.findAll({ where, order: [['id', 'DESC']] });
      res.json({ data: await decorate(rows) });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, handlers.getOne);

  router.post('/', async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) return res.status(403).json({ error: 'Solo administración crea plantillas de turno.' });

      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'Ponle un nombre a la plantilla (ej. "Garita principal — diurno").' });

      const horaInicio = parseHora(req.body.hora_inicio);
      const horaFin = parseHora(req.body.hora_fin);
      if (!horaInicio || !horaFin) return res.status(400).json({ error: 'Indica una hora de inicio y fin válidas.' });
      if (horaInicio === horaFin) return res.status(400).json({ error: 'La hora de inicio y fin no pueden ser iguales.' });

      const dias = parseDiasSemana(req.body.dias_semana);
      if (!dias.length) return res.status(400).json({ error: 'Selecciona al menos un día de la semana.' });

      const guardiaIds = [...new Set((req.body.guardia_ids || []).map(Number).filter(Boolean))];
      if (!guardiaIds.length) return res.status(400).json({ error: 'Selecciona al menos un guardia. Con uno solo, el turno se repite siempre con esa persona; con varios, se van rotando en ese orden.' });

      const plantilla = await model.create({
        residencial_id: resolverResidencialId(req.user, req.body),
        punto_acceso_id: req.body.punto_acceso_id || null,
        nombre,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        dias_semana: dias.join(','),
        activa: req.body.activa === undefined ? true : Boolean(req.body.activa),
        creado_por: req.user.id,
      });
      await reemplazarGuardias(plantilla.id, guardiaIds);
      res.status(201).json({ data: (await decorate([plantilla]))[0] });
    } catch (err) { next(err); }
  });

  const editar = async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) return res.status(403).json({ error: 'Solo administración edita plantillas de turno.' });
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Plantilla no encontrada.' });

      const allowed = {};
      if (req.body.nombre !== undefined) {
        const nombre = String(req.body.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
        allowed.nombre = nombre;
      }
      if (req.body.punto_acceso_id !== undefined) allowed.punto_acceso_id = req.body.punto_acceso_id || null;
      if (req.body.hora_inicio !== undefined) {
        const h = parseHora(req.body.hora_inicio);
        if (!h) return res.status(400).json({ error: 'Hora de inicio inválida.' });
        allowed.hora_inicio = h;
      }
      if (req.body.hora_fin !== undefined) {
        const h = parseHora(req.body.hora_fin);
        if (!h) return res.status(400).json({ error: 'Hora de fin inválida.' });
        allowed.hora_fin = h;
      }
      if (req.body.dias_semana !== undefined) {
        const dias = parseDiasSemana(req.body.dias_semana);
        if (!dias.length) return res.status(400).json({ error: 'Selecciona al menos un día de la semana.' });
        allowed.dias_semana = dias.join(',');
      }
      if (req.body.activa !== undefined) allowed.activa = Boolean(req.body.activa);

      await row.update(allowed);
      if (req.body.guardia_ids !== undefined) {
        const guardiaIds = [...new Set((req.body.guardia_ids || []).map(Number).filter(Boolean))];
        if (!guardiaIds.length) return res.status(400).json({ error: 'La plantilla necesita al menos un guardia.' });
        await reemplazarGuardias(row.id, guardiaIds);
      }
      res.json({ data: (await decorate([row]))[0] });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, editar);
  router.patch(`/${pkPath}`, editar);

  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) return res.status(403).json({ error: 'Solo administración elimina plantillas de turno.' });
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Plantilla no encontrada.' });
      // Los turnos ya generados a partir de esta plantilla NO se borran
      // (fk_turno_plantilla es ON DELETE SET NULL): el historial de
      // jornadas pasadas se conserva aunque se elimine la plantilla.
      await row.destroy();
      res.json({ data: { id: row.id } });
    } catch (err) { next(err); }
  });
};

module.exports.parseDiasSemana = parseDiasSemana;
module.exports.parseHora = parseHora;
