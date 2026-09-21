'use strict';

// Requisito 8: boton de panico/SOS. Al crear una alerta, notifica de
// inmediato a todos los guardias y administradores activos de la misma
// residencial (no hay push/websocket en este entregable: la
// "inmediatez" hoy es una fila en notificaciones que el frontend puede
// pollear o el guardia ve al entrar al panel; conectar push queda
// como mejora futura, ver README).

const { Op } = require('sequelize');
const db = require('../../models');
const notificacionesService = require('../../services/notificacionesService');
const { parsePagination, parseSort, buildFilters, applyOwnershipScope } = require('../../utils/crudFactory');
const { esSuperadmin, resolverResidencialId } = require('../../config/estados');

// Regla de negocio (Requisito 8): quien debe enterarse de inmediato de una
// alerta de panico es el personal operativo de la residencial, no
// cualquier usuario activo. Antes este criterio vivia como un arreglo
// literal ['guardia', 'admin'] escrito directo dentro del where del
// include, mezclado con la consulta SQL. Nombrarlo aca lo convierte en
// una regla legible y reusable si otro flujo (por ejemplo un reporte de
// "quien recibe alertas") necesita el mismo criterio.
const ROLES_NOTIFICAR_ALERTA = ['guardia', 'admin'];

// El guardia tiene permiso para leer alertas_panico (AUTH_ONLY) pero NO
// para consultar /api/usuarios (requiere "usuarios.gestionar", que solo
// tiene admin/superadmin). Sin este enriquecido, el portal del guardia
// solo podria mostrar un usuario_id en crudo. Se resuelve aca, en el
// backend, en vez de exponer el listado completo de usuarios al guardia.
async function decorateAlertas(rows) {
  const usuarioIds = [...new Set(rows.map((r) => r.usuario_id).filter(Boolean))];
  const tipoIds = [...new Set(rows.map((r) => r.tipo_alerta_id).filter(Boolean))];
  const atendidaIds = [...new Set(rows.map((r) => r.atendida_por).filter(Boolean))];
  const allUserIds = [...new Set([...usuarioIds, ...atendidaIds])];

  const [usuarios, residentes, tipos] = await Promise.all([
    allUserIds.length
      ? db.Usuarios.findAll({ where: { id: { [Op.in]: allUserIds } }, attributes: ['id', 'nombre', 'apellido', 'telefono'] })
      : [],
    usuarioIds.length
      ? db.Residentes.findAll({ where: { usuario_id: { [Op.in]: usuarioIds } } })
      : [],
    tipoIds.length
      ? db.TiposAlerta.findAll({ where: { id: { [Op.in]: tipoIds } }, attributes: ['id', 'codigo', 'nombre'] })
      : [],
  ]);

  const userMap = new Map(usuarios.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
  // Antes esto se quedaba corto a proposito (id/nombre/apellido, sin
  // telefono) para no exponerle a un guardia el listado completo de
  // usuarios -- pero el guardia SI necesita poder llamar de inmediato a
  // quien activo una alerta de panico real, no buscar su contacto en
  // otro lado mientras la emergencia sigue activa. Esto expone
  // unicamente el telefono de quien esta en la propia lista de alertas,
  // no un listado general de usuarios.
  const telefonoMap = new Map(usuarios.map((u) => [String(u.id), u.telefono || null]));
  const viviendaIds = [...new Set(residentes.map((r) => r.vivienda_id).filter(Boolean))];
  const viviendas = viviendaIds.length
    ? await db.Viviendas.findAll({ where: { id: { [Op.in]: viviendaIds } }, attributes: ['id', 'numero', 'bloque_torre'] })
    : [];
  const viviendaMap = new Map(viviendas.map((v) => [String(v.id), `${v.bloque_torre ? v.bloque_torre + ' · ' : ''}Vivienda ${v.numero}`]));
  const residenteMap = new Map(residentes.map((r) => [String(r.usuario_id), viviendaMap.get(String(r.vivienda_id)) || null]));
  const tipoMap = new Map(tipos.map((t) => [String(t.id), t]));

  return rows.map((r) => {
    const data = r.toJSON();
    data.usuario_nombre = userMap.get(String(r.usuario_id)) || `Usuario #${r.usuario_id}`;
    data.usuario_telefono = telefonoMap.get(String(r.usuario_id)) || null;
    data.vivienda = residenteMap.get(String(r.usuario_id)) || null;
    const tipo = tipoMap.get(String(r.tipo_alerta_id));
    data.tipo_alerta_nombre = tipo ? tipo.nombre : null;
    data.tipo_alerta_codigo = tipo ? tipo.codigo : null;
    data.atendida_por_nombre = r.atendida_por ? (userMap.get(String(r.atendida_por)) || null) : null;
    return data;
  });
}

module.exports = function alertasPanicoOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });

      // "alcance" no se guarda en la base (alertas_panico no tiene esa
      // columna, y no hace falta migracion: es solo una instruccion de
      // este request, no un dato del incidente). Solo decide, ademas de
      // avisar siempre a guardia/admin, si TAMBIEN se notifica a los
      // vecinos de la misma torre -- antes "Alertar a residentes" en el
      // frontend prometia esto y nunca lo hacia (ver incidencias.js).
      const alcance = req.body.alcance === 'residentes' ? 'residentes' : 'guardia';

      const body = {
        tipo_alerta_id: req.body.tipo_alerta_id,
        ubicacion_lat: req.body.ubicacion_lat,
        ubicacion_lng: req.body.ubicacion_lng,
        usuario_id: req.user.id,
        residencial_id: resolverResidencialId(req.user, req.body),
      };

      // Antes, pulsar el boton de panico varias veces (o probar los dos
      // botones) dejaba varias alertas ACTIVAS de la misma persona: el
      // guardia veia "3 alertas SOS" por un mismo aviso y cada una
      // volvia a notificar a todo el personal. Si esa persona ya tiene una
      // alerta activa de los ultimos 2 minutos, se devuelve esa misma.
      const reciente = await model.findOne({
        where: {
          usuario_id: req.user.id,
          residencial_id: body.residencial_id,
          estado: 'activa',
          fecha_hora: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) },
        },
        order: [['fecha_hora', 'DESC']],
      });
      if (reciente) {
        return res.status(200).json({ data: reciente, notificados: 0, vecinos_notificados: 0, duplicada: true });
      }

      const alerta = await model.create(body);

      const destinatarios = await db.Usuarios.findAll({
        where: { residencial_id: alerta.residencial_id, estado: 'activo' },
        include: [{ model: db.Roles, as: 'rol', where: { codigo: ROLES_NOTIFICAR_ALERTA } }],
      });

      const tareasNotificacion = destinatarios.map((destinatario) =>
        notificacionesService.crear({
          usuario_id: destinatario.id,
          tipo: 'alerta',
          titulo: 'Alerta de panico activada',
          mensaje: 'Se activo una alerta de panico/SOS en la residencial. Revisar de inmediato.',
          referencia_tipo: 'alertas_panico',
          referencia_id: alerta.id,
        })
      );

      let vecinosNotificados = 0;
      if (alcance === 'residentes') {
        const propio = await db.Residentes.findOne({ where: { usuario_id: req.user.id } });
        const propiaVivienda = propio ? await db.Viviendas.findByPk(propio.vivienda_id) : null;
        if (propiaVivienda && propiaVivienda.bloque_torre) {
          const viviendasTorre = await db.Viviendas.findAll({
            where: { residencial_id: alerta.residencial_id, bloque_torre: propiaVivienda.bloque_torre },
            attributes: ['id'],
          });
          const viviendaIds = viviendasTorre.map((v) => v.id);
          const vecinosResidentes = viviendaIds.length
            ? await db.Residentes.findAll({ where: { vivienda_id: { [Op.in]: viviendaIds }, usuario_id: { [Op.ne]: req.user.id } } })
            : [];
          const vecinoUsuarioIds = [...new Set(vecinosResidentes.map((v) => v.usuario_id))];
          if (vecinoUsuarioIds.length) {
            const vecinosActivos = await db.Usuarios.findAll({
              where: { id: { [Op.in]: vecinoUsuarioIds }, estado: 'activo' },
            });
            vecinosNotificados = vecinosActivos.length;
            tareasNotificacion.push(
              ...vecinosActivos.map((v) =>
                notificacionesService.crear({
                  usuario_id: v.id,
                  tipo: 'alerta',
                  titulo: 'Alerta de un vecino en tu torre',
                  mensaje: 'Un vecino de tu torre activo una alerta de panico/SOS. Mantente alerta y evita esa zona hasta que el guardia confirme que fue atendida.',
                  referencia_tipo: 'alertas_panico',
                  referencia_id: alerta.id,
                })
              )
            );
          }
        }
      }

      await Promise.all(tareasNotificacion);

      res.status(201).json({ data: alerta, notificados: destinatarios.length, vecinos_notificados: vecinosNotificados });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const order = parseSort(req.query, model) || [['fecha_hora', 'DESC']];
      let where = buildFilters(req.query, model);
      where = applyOwnershipScope(model, req.user, where);
      const { rows, count } = await model.findAndCountAll({ where, limit, offset, order });
      res.json({ data: await decorateAlertas(rows), meta: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) } });
    } catch (err) { next(err); }
  });
  // Atender una alerta. Antes el portal del guardia mandaba un PATCH
  // generico con atendida_por y fecha_atencion armados por el NAVEGADOR
  // (hora del dispositivo, id de la sesion local): cualquier desajuste o
  // un permiso mal sembrado lo dejaba fallando, y la alerta se quedaba
  // "activa" para siempre. Ahora el servidor pone quien y cuando, solo
  // acepta pasar de "activa" a "atendida"/"falsa_alarma", y avisa al
  // residente que la activo.
  const ACCIONES_ALERTA = { atendida: 'atendida', falsa_alarma: 'marcada como falsa alarma' };
  const esPersonal = (req) => ['guardia', 'admin', 'superadmin'].includes(req.user.rol_codigo);

  function alcanceResidencial(req, where) {
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    return where;
  }

  // Cerrar varias de una vez (ids explicitos, o las activas de hace mas
  // de N horas -- las que quedan de pruebas o de alguien que ya no esta
  // en peligro). Va como PATCH para heredar el permiso "alertas.atender".
  router.patch('/atender-lote', async (req, res, next) => {
    try {
      if (!esPersonal(req)) return res.status(403).json({ error: 'Solo el personal puede atender alertas.' });
      const estado = req.body.estado;
      if (!ACCIONES_ALERTA[estado]) return res.status(400).json({ error: 'Estado invalido.' });
      const where = alcanceResidencial(req, { estado: 'activa' });
      if (Array.isArray(req.body.ids) && req.body.ids.length) {
        where.id = { [Op.in]: req.body.ids.map(Number).filter(Number.isFinite) };
      } else if (Number(req.body.antiguas_horas) > 0) {
        where.fecha_hora = { [Op.lt]: new Date(Date.now() - Number(req.body.antiguas_horas) * 3600000) };
      } else {
        return res.status(400).json({ error: 'Indica ids o antiguas_horas.' });
      }
      const filas = await model.findAll({ where });
      const ahora = new Date();
      for (const fila of filas) {
        await fila.update({ estado, atendida_por: req.user.id, fecha_atencion: ahora });
      }
      res.json({ actualizadas: filas.length });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}/atender`, async (req, res, next) => {
    try {
      if (!esPersonal(req)) return res.status(403).json({ error: 'Solo el personal puede atender alertas.' });
      const estado = req.body.estado;
      if (!ACCIONES_ALERTA[estado]) return res.status(400).json({ error: 'Estado invalido: usa "atendida" o "falsa_alarma".' });
      const row = await model.findOne({ where: alcanceResidencial(req, { id: req.params.id }) });
      if (!row) return res.status(404).json({ error: 'La alerta no existe o no es de tu residencial.' });
      if (row.estado !== 'activa') {
        const [dec] = await decorateAlertas([row]);
        const quien = dec.atendida_por_nombre ? ` por ${dec.atendida_por_nombre}` : '';
        return res.status(409).json({ error: `Esta alerta ya estaba ${row.estado === 'atendida' ? 'atendida' : 'cerrada como falsa alarma'}${quien}.`, data: dec });
      }
      await row.update({ estado, atendida_por: req.user.id, fecha_atencion: new Date() });
      try {
        await notificacionesService.crear({
          usuario_id: row.usuario_id,
          tipo: 'alerta',
          titulo: estado === 'atendida' ? 'Tu alerta fue atendida' : 'Tu alerta fue cerrada como falsa alarma',
          mensaje: estado === 'atendida'
            ? 'El personal de seguridad atendio tu alerta de panico.'
            : 'El personal de seguridad marco tu alerta como falsa alarma. Si de verdad necesitas ayuda, vuelve a activarla.',
          referencia_tipo: 'alertas_panico',
          referencia_id: row.id,
        });
      } catch (e) { /* la alerta ya quedo cerrada; no se bloquea por la notificacion */ }
      const [dec] = await decorateAlertas([row]);
      res.json({ data: dec });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
