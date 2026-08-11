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
      ? db.Usuarios.findAll({ where: { id: { [Op.in]: allUserIds } }, attributes: ['id', 'nombre', 'apellido'] })
      : [],
    usuarioIds.length
      ? db.Residentes.findAll({ where: { usuario_id: { [Op.in]: usuarioIds } } })
      : [],
    tipoIds.length
      ? db.TiposAlerta.findAll({ where: { id: { [Op.in]: tipoIds } }, attributes: ['id', 'codigo', 'nombre'] })
      : [],
  ]);

  const userMap = new Map(usuarios.map((u) => [String(u.id), `${u.nombre} ${u.apellido}`.trim()]));
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

      const body = {
        ...req.body,
        usuario_id: req.user.id,
        residencial_id: req.user.rol_codigo === 'superadmin' ? req.body.residencial_id : req.user.residencial_id,
      };

      const alerta = await model.create(body);

      const destinatarios = await db.Usuarios.findAll({
        where: { residencial_id: alerta.residencial_id, estado: 'activo' },
        include: [{ model: db.Roles, as: 'rol', where: { codigo: ['guardia', 'admin'] } }],
      });

      await Promise.all(
        destinatarios.map((destinatario) =>
          notificacionesService.crear({
            usuario_id: destinatario.id,
            tipo: 'alerta',
            titulo: 'Alerta de panico activada',
            mensaje: 'Se activo una alerta de panico/SOS en la residencial. Revisar de inmediato.',
            referencia_tipo: 'alertas_panico',
            referencia_id: alerta.id,
          })
        )
      );

      res.status(201).json({ data: alerta, notificados: destinatarios.length });
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
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
