'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const { VETO_ESTADO, VETO_ALCANCE, esAdmin, esSuperadmin } = require('../../config/estados');

// Regla de negocio (Requisito de conflictos): si al activar un veto la
// persona vetada tiene tambien una autorizacion recurrente vigente,
// hay una contradiccion que debe quedar registrada para que alguien la
// resuelva a mano. Antes esta logica (buscar la autorizacion + decidir si
// crear el conflicto) vivia mezclada adentro del handler HTTP de
// "resolver veto", en un bloque if de 20 lineas. Sacarla a una funcion
// con nombre dice, sin leer el detalle, que es exactamente lo que hace, y
// permite reusarla el dia que se detecten conflictos desde otro flujo
// (por ejemplo al crear una persona_autorizada nueva).
async function detectarConflictoPorVetoActivo(vetoActivado, user, transaction) {
  if (!vetoActivado.numero_documento) return null;

  const autorizado = await db.PersonasAutorizadas.findOne({
    where: {
      residencial_id: vetoActivado.residencial_id,
      numero_documento: vetoActivado.numero_documento,
      estado: { [Op.in]: ['pendiente', 'activa'] },
    },
    transaction,
  });
  if (!autorizado) return null;

  return db.ConflictosPermisos.create({
    residencial_id: vetoActivado.residencial_id,
    persona_autorizada_id: autorizado.id,
    veto_id: vetoActivado.id,
    nombre_persona: vetoActivado.nombre_persona,
    numero_documento: vetoActivado.numero_documento,
    descripcion: 'La persona tiene una autorizacion recurrente y un veto activo.',
    detectado_por: user.id,
  }, { transaction });
}

module.exports = function vetosAccesoOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      if (req.user.rol_codigo === 'residente') where.solicitado_por = req.user.id;
      if (req.query.estado) where.estado = req.query.estado;
      const rows = await model.findAll({ where, order: [['fecha_creacion', 'DESC']], limit: 200 });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const nombre = String(req.body.nombre_persona || '').trim();
      const motivo = String(req.body.motivo || '').trim();
      if (!nombre || !motivo) return res.status(400).json({ error: 'Nombre y motivo son requeridos.' });

      // Un residente solo puede vetar dentro de su propia vivienda; solo
      // admin/superadmin puede pedir un veto a nivel de toda la
      // residencial. Igual, un residente no puede autoaprobar su propio
      // veto: siempre nace "pendiente" y lo activa un admin.
      const alcance = req.user.rol_codigo === 'residente' ? VETO_ALCANCE.VIVIENDA : (req.body.alcance || VETO_ALCANCE.RESIDENCIAL);
      const estado = esAdmin(req.user) ? (req.body.estado || VETO_ESTADO.ACTIVO) : VETO_ESTADO.PENDIENTE;
      const nace_activo = estado === VETO_ESTADO.ACTIVO;

      const row = await model.create({
        residencial_id: req.user.residencial_id || req.body.residencial_id,
        solicitado_por: req.user.id,
        aprobado_por: nace_activo ? req.user.id : null,
        visitante_id: req.body.visitante_id || null,
        nombre_persona: nombre,
        tipo_documento: req.body.tipo_documento || null,
        numero_documento: req.body.numero_documento || null,
        telefono: req.body.telefono || null,
        alcance,
        motivo,
        evidencia_url: req.body.evidencia_url || null,
        estado,
        fecha_desde: nace_activo ? new Date() : null,
        fecha_hasta: req.body.fecha_hasta || null,
        fecha_resolucion: nace_activo ? new Date() : null,
      });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}/resolver`, async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (!esAdmin(req.user)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo administracion puede aprobar, rechazar o revocar vetos.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where, transaction });
      if (!row) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Veto no encontrado.' });
      }
      const estado = req.body.estado;
      if (![VETO_ESTADO.ACTIVO, VETO_ESTADO.RECHAZADO, VETO_ESTADO.REVOCADO].includes(estado)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Estado de resolucion invalido.' });
      }
      await row.update({
        estado,
        aprobado_por: req.user.id,
        fecha_desde: estado === VETO_ESTADO.ACTIVO ? (row.fecha_desde || new Date()) : row.fecha_desde,
        fecha_resolucion: new Date(),
      }, { transaction });

      const conflicto = estado === VETO_ESTADO.ACTIVO
        ? await detectarConflictoPorVetoActivo(row, req.user, transaction)
        : null;

      await transaction.commit();
      res.json({ data: row, conflicto });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, handlers.update);
  router.patch(`/${pkPath}`, handlers.update);

  // La tabla no tiene columna de borrado logico (activo), asi que el
  // DELETE generico haria un destroy() fisico y se perderia el registro
  // de que alguien estuvo vetado (importante para auditoria/evidencia).
  // Nadie en la interfaz llama a este endpoint hoy, pero lo dejamos
  // seguro por si se usa directo contra la API: revoca en vez de borrar.
  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) {
        return res.status(403).json({ error: 'Solo administracion puede revocar un veto.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Veto no encontrado.' });
      await row.update({ estado: VETO_ESTADO.REVOCADO, aprobado_por: req.user.id, fecha_resolucion: new Date() });
      res.json({ data: row, mensaje: 'Veto revocado. Se conserva el historial.' });
    } catch (err) { next(err); }
  });
};

// Se expone para poder probar la regla de deteccion de conflicto sin
// levantar servidor ni base de datos real (se mockea db.PersonasAutorizadas
// y db.ConflictosPermisos). Ver tests/vetosAcceso.reglas.test.js.
module.exports.detectarConflictoPorVetoActivo = detectarConflictoPorVetoActivo;
