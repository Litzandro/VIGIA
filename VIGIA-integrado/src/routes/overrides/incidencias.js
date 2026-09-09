'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const notificacionesService = require('../../services/notificacionesService');
const { validarCampos } = require('../../config/resourceValidation');
const { validarImagenBase64 } = require('../../utils/imagenValidator');

const ESTADO_LABEL = {
  reportada: 'fue registrada',
  en_revision: 'está ahora en revisión',
  en_progreso: 'está ahora en progreso',
  resuelta: 'fue resuelta',
  cerrada: 'fue cerrada',
};

function folio(incidencia) {
  return `#INC-${String(incidencia.id).padStart(4, '0')}`;
}

function normalizePriority(value) {
  const map = { baja: 'baja', media: 'media', alta: 'alta', urgente: 'urgente' };
  return map[String(value || '').toLowerCase()] || 'media';
}

module.exports = function incidenciasOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = {};
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      // Privacidad (corregida): un residente ve sus propias incidencias
      // (privadas o no) y ademas las de visibilidad "comunidad" de su
      // mismo residencial (antes solo veia las suyas, por lo que una
      // notificacion de una incidencia publica de otro vecino llevaba a
      // un 404). Nunca ve privadas/administracion de otros residentes,
      // ni nada de otro residencial (eso ya lo filtra residencial_id).
      const andConditions = [];
      if (req.user.rol_codigo === 'residente') {
        andConditions.push({ [Op.or]: [{ reportado_por: req.user.id }, { visibilidad: 'comunidad' }] });
      }
      if (req.query.estado && model.rawAttributes.estado) where.estado = req.query.estado;
      if (req.query.prioridad && model.rawAttributes.prioridad) where.prioridad = req.query.prioridad;
      if (req.query.q) {
        andConditions.push({
          [Op.or]: [
            { titulo: { [Op.like]: `%${req.query.q}%` } },
            { descripcion: { [Op.like]: `%${req.query.q}%` } },
          ],
        });
      }
      if (andConditions.length) where[Op.and] = andConditions;
      // Se incluye el tipo para que el tablero pueda mostrar de que
      // categoria es cada incidencia (antes no viajaba, asi que la
      // tarjeta solo mostraba prioridad, nunca el tipo elegido).
      const rows = await model.findAll({
        where,
        include: [{ model: db.TiposIncidencia, as: 'tipoIncidencia', attributes: ['id', 'nombre', 'nivel_urgencia'] }],
        order: [['fecha_hora', 'DESC']],
        limit: 200,
      });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      const body = req.body || {};
      const titulo = String(body.titulo || '').trim();
      const descripcion = String(body.descripcion || '').trim();
      if (!titulo || !descripcion) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El titulo y la descripcion son requeridos.' });
      }
      if (titulo.length > 150 || descripcion.length > 500) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El titulo admite 150 caracteres y la descripcion 500.' });
      }
      // Bug real encontrado probando el flujo completo contra un
      // servidor de verdad (no solo revisando el codigo): el chequeo de
      // arriba solo verifica "no vacio" y "no mas de 150/500
      // caracteres" -- nunca un minimo razonable. Un titulo de una sola
      // letra ("A") pasaba sin problema porque tecnicamente no esta
      // vacio. Se agrega aqui el chequeo de minimo (3 caracteres, ya
      // definido en resourceValidation.js) sin duplicar el de maximo
      // que ya esta arriba.
      if (titulo.length < 3 || descripcion.length < 3) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El titulo y la descripcion necesitan al menos 3 caracteres.' });
      }
      // El guardia debe adjuntar evidencia al reportar desde garita.
      if (req.user.rol_codigo === 'guardia' && !body.evidencia_url) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El guardia debe adjuntar una fotografia o evidencia.' });
      }

      const residencialId = req.user.residencial_id || body.residencial_id;

      // El tipo elegido debe pertenecer a la misma residencial (o venir
      // sin residencial_id, para catalogos compartidos/globales) -- si
      // alguien manda un tipo_incidencia_id que no le corresponde, se
      // trata igual que si no hubiera mandado nada.
      let tipo = null;
      if (body.tipo_incidencia_id) {
        tipo = await db.TiposIncidencia.findOne({
          where: { id: body.tipo_incidencia_id, [Op.or]: [{ residencial_id: residencialId }, { residencial_id: null }] },
          transaction,
        });
      }
      if (!tipo) {
        tipo = await db.TiposIncidencia.findOne({
          where: { residencial_id: residencialId, nombre: 'Otro', activo: true },
          transaction,
        });
      }
      if (!tipo) throw new Error('No existe un tipo de incidencia disponible.');

      const errores = validarCampos(model, { ubicacion: body.ubicacion, guardia_original_nombre: req.user.rol_codigo === 'guardia' ? req.user.nombre_completo : null });
      if (errores.length) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Datos invalidos', detalles: errores });
      }

      // La prioridad ya no la decide libremente quien reporta: se deriva
      // del nivel de urgencia real del tipo elegido
      // (tipos_incidencia.nivel_urgencia). Hallazgo del equipo: sin esto,
      // cualquier residente podia marcar su propio reporte como "alta" o
      // "urgente" sin que nada lo validara -- si todos exageran la
      // prioridad de lo suyo, las incidencias de verdad graves se pierden
      // mezcladas con el resto. Guardia/admin/superadmin si conservan
      // control manual (ya tienen criterio profesional, y de todos modos
      // pueden ajustarla despues via PATCH); un residente reportando su
      // propio caso, no.
      const NIVEL_A_PRIORIDAD = { critico: 'urgente', alto: 'alta', medio: 'media', bajo: 'baja' };
      const prioridadDerivada = NIVEL_A_PRIORIDAD[tipo.nivel_urgencia] || 'media';
      const esStaff = ['guardia', 'admin', 'superadmin'].includes(req.user.rol_codigo);
      // Guardia/admin conservan la posibilidad de fijarla a mano SOLO si
      // la mandan explicitamente (ej. desde un panel de triage futuro) --
      // si no mandan nada (como el formulario simplificado que usa
      // guardia hoy), tambien reciben el valor derivado en vez de un
      // "media" fijo sin relacion con el tipo.
      const prioridad = (esStaff && body.prioridad) ? normalizePriority(body.prioridad) : prioridadDerivada;

      const incidencia = await model.create({
        residencial_id: residencialId,
        tipo_incidencia_id: tipo.id,
        reportado_por: req.user.id,
        asignado_a: body.asignado_a || null,
        guardia_original_nombre: req.user.rol_codigo === 'guardia' ? req.user.nombre_completo : null,
        titulo,
        descripcion,
        visibilidad: ['privada', 'administracion', 'comunidad'].includes(body.visibilidad) ? body.visibilidad : 'privada',
        ubicacion: body.ubicacion || null,
        prioridad,
        estado: 'reportada',
      }, { transaction });

      let evidencia = null;
      if (body.evidencia_url) {
        if (String(body.evidencia_url).length > 1500000) {
          await transaction.rollback();
          return res.status(413).json({ error: 'La fotografia es demasiado grande. Usa una imagen comprimida.' });
        }
        // Antes solo se revisaba el TAMAÑO del texto -- nada confirmaba
        // que el contenido fuera de verdad una imagen. Se encontro que
        // un archivo (un PDF) renombrado a .png se podia colar aqui si
        // la peticion se mandaba directo a la API, sin pasar por el
        // navegador (que si suele rechazar decodificar un PDF disfrazado
        // de imagen).
        const chequeoImagen = validarImagenBase64(body.evidencia_url);
        if (!chequeoImagen.ok) {
          await transaction.rollback();
          return res.status(400).json({ error: chequeoImagen.error });
        }
        evidencia = await db.IncidenciasEvidencias.create({
          incidencia_id: incidencia.id,
          tipo_archivo: body.evidencia_tipo || 'imagen',
          url_archivo: body.evidencia_url,
        }, { transaction });
      }

      await transaction.commit();

      // Integracion con Notificaciones (requisito 5): el residente que
      // reporta se entera de inmediato de que quedo registrada, sin
      // depender de recargar la pagina.
      try {
        await notificacionesService.crear({
          usuario_id: incidencia.reportado_por,
          tipo: 'incidencia',
          titulo: `Tu incidencia ${folio(incidencia)} fue registrada`,
          mensaje: titulo,
          referencia_tipo: 'incidencia',
          referencia_id: incidencia.id,
        });
      } catch (notifyErr) { /* la incidencia ya quedo guardada; no se bloquea por un fallo al notificar */ }

      // Si la incidencia es publica (visibilidad "comunidad"), el resto
      // de los residentes tambien debe enterarse, no solo quien la
      // reporto (se pidio explicitamente: "si una incidencia es publica
      // deberia aparecer en notificaciones").
      if (incidencia.visibilidad === 'comunidad' && incidencia.residencial_id) {
        try {
          await notificacionesService.crearParaResidencial({
            residencial_id: incidencia.residencial_id,
            excluirUsuarioId: incidencia.reportado_por,
            tipo: 'incidencia',
            titulo: `Nueva incidencia pública ${folio(incidencia)}`,
            mensaje: titulo,
            referencia_tipo: 'incidencia',
            referencia_id: incidencia.id,
          });
        } catch (notifyErr) { /* idem: no se bloquea la respuesta por un fallo al notificar */ }
      }

      res.status(201).json({ data: incidencia, evidencia });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      // Misma correccion que en el listado: propias o publicas del
      // mismo residencial, nunca privadas/administracion de otro vecino.
      if (req.user.rol_codigo === 'residente') where[Op.or] = [{ reportado_por: req.user.id }, { visibilidad: 'comunidad' }];
      const row = await model.findOne({
        where,
        include: [
          { model: db.TiposIncidencia, as: 'tipoIncidencia' },
          { model: db.Usuarios, as: 'reportadoPor', attributes: ['id', 'nombre', 'apellido'] },
          { model: db.Usuarios, as: 'asignadoA', attributes: ['id', 'nombre', 'apellido'] },
        ],
      });
      if (!row) return res.status(404).json({ error: 'Incidencia no encontrada.' });
      const [evidencias, seguimiento] = await Promise.all([
        db.IncidenciasEvidencias.findAll({ where: { incidencia_id: row.id } }),
        db.IncidenciasSeguimiento.findAll({
          where: { incidencia_id: row.id },
          include: [{ model: db.Usuarios, as: 'usuario', attributes: ['id', 'nombre', 'apellido'] }],
          order: [['fecha_hora', 'ASC']],
        }),
      ]);
      res.json({ data: row, evidencias, seguimiento });
    } catch (err) { next(err); }
  });

  router.patch(`/${pkPath}`, async (req, res, next) => {
    try {
      if (req.user.rol_codigo === 'residente') {
        return res.status(403).json({ error: 'El residente puede reportar y consultar; el cierre corresponde a guardia o administracion.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Incidencia no encontrada.' });
      const allowed = {};
      ['estado', 'prioridad', 'asignado_a', 'ubicacion'].forEach((k) => {
        if (req.body[k] !== undefined) allowed[k] = req.body[k];
      });
      if (allowed.estado === 'cerrada') {
        allowed.cerrada_por = req.user.id;
        allowed.fecha_resolucion = new Date();
      }
      const anterior = row.estado;
      await row.update(allowed);
      if (allowed.estado && allowed.estado !== anterior) {
        await db.IncidenciasSeguimiento.create({
          incidencia_id: row.id,
          usuario_id: req.user.id,
          comentario: req.body.comentario || null,
          estado_anterior: anterior,
          estado_nuevo: allowed.estado,
        });
        // El residente que reporto se entera del avance sin tener que
        // volver a entrar a consultar (requisito 5, integracion entre
        // modulos).
        try {
          await notificacionesService.crear({
            usuario_id: row.reportado_por,
            tipo: 'incidencia',
            titulo: `Tu incidencia ${folio(row)} ${ESTADO_LABEL[allowed.estado] || 'cambió de estado'}`,
            mensaje: row.titulo,
            referencia_tipo: 'incidencia',
            referencia_id: row.id,
          });
        } catch (notifyErr) { /* el estado ya se guardo; no se bloquea por un fallo al notificar */ }

        // Si es publica, el avance tambien se avisa al resto de vecinos.
        if (row.visibilidad === 'comunidad' && row.residencial_id) {
          try {
            await notificacionesService.crearParaResidencial({
              residencial_id: row.residencial_id,
              excluirUsuarioId: row.reportado_por,
              tipo: 'incidencia',
              titulo: `Incidencia pública ${folio(row)} ${ESTADO_LABEL[allowed.estado] || 'cambió de estado'}`,
              mensaje: row.titulo,
              referencia_tipo: 'incidencia',
              referencia_id: row.id,
            });
          } catch (notifyErr) { /* idem */ }
        }
      }
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.put(`/${pkPath}`, handlers.update);
  router.delete(`/${pkPath}`, handlers.remove);
};
