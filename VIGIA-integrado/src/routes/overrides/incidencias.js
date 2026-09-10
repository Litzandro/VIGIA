'use strict';

const db = require('../../models');
const { Op } = require('sequelize');
const { primaryKeyWhere } = require('../../utils/crudFactory');
const notificacionesService = require('../../services/notificacionesService');
const { validarCampos } = require('../../config/resourceValidation');
const { validarImagenBase64 } = require('../../utils/imagenValidator');

const ESTADO_LABEL = {
  pendiente_aprobacion: 'está pendiente de aprobación',
  reportada: 'fue registrada',
  en_revision: 'está ahora en revisión',
  en_progreso: 'está ahora en progreso',
  resuelta: 'fue resuelta',
  cerrada: 'fue cerrada',
  rechazada: 'fue rechazada',
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

      // Hallazgo revisando reportes reales: sin pedir DONDE y CUANDO
      // paso el hecho, guardia/admin recibian titulo+descripcion nomas y
      // tenian que preguntar esos dos datos por aparte (chat, llamada) en
      // cada incidencia -- justo los dos datos que mas se piden al
      // levantar un reporte de verdad. Ahora son requeridos.
      const ubicacion = String(body.ubicacion || '').trim();
      if (!ubicacion) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La ubicación exacta es requerida.' });
      }
      if (!body.fecha_hora_hecho) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Indica cuándo ocurrió el hecho.' });
      }
      const fechaHoraHecho = new Date(body.fecha_hora_hecho);
      if (Number.isNaN(fechaHoraHecho.getTime())) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La fecha/hora del hecho no es válida.' });
      }
      // Margen de 5 minutos para no pelear con pequeños desfaces de
      // reloj entre el dispositivo de quien reporta y el servidor.
      if (fechaHoraHecho.getTime() > Date.now() + 5 * 60 * 1000) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La fecha/hora del hecho no puede ser en el futuro.' });
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

      const errores = validarCampos(model, { ubicacion, guardia_original_nombre: req.user.rol_codigo === 'guardia' ? req.user.nombre_completo : null });
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

      // Requisito nuevo: un reporte de un RESIDENTE no cuenta como
      // "oficial" de una vez -- guardia/admin lo revisan primero
      // (aprobar/rechazar, ver la ruta "/:id/revisar" mas abajo) antes
      // de que siga el flujo normal. Esto frena reportes vacios,
      // irrespetuosos o de mala fe antes de que lleguen a notificar a
      // toda la comunidad (si son "comunidad") o a ocupar tiempo de
      // guardia como si fueran un caso real. Guardia/admin/superadmin
      // reportando ellos mismos (ej. guardia desde garita) no pasan por
      // esto -- ya son personal de confianza, su reporte es oficial de
      // una vez, igual que antes de este cambio.
      const estadoInicial = esStaff ? 'reportada' : 'pendiente_aprobacion';

      const incidencia = await model.create({
        residencial_id: residencialId,
        tipo_incidencia_id: tipo.id,
        reportado_por: req.user.id,
        asignado_a: body.asignado_a || null,
        guardia_original_nombre: req.user.rol_codigo === 'guardia' ? req.user.nombre_completo : null,
        titulo,
        descripcion,
        visibilidad: ['privada', 'administracion', 'comunidad'].includes(body.visibilidad) ? body.visibilidad : 'privada',
        ubicacion,
        fecha_hora_hecho: fechaHoraHecho,
        prioridad,
        estado: estadoInicial,
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
          titulo: estadoInicial === 'pendiente_aprobacion'
            ? `Tu incidencia ${folio(incidencia)} está pendiente de aprobación`
            : `Tu incidencia ${folio(incidencia)} fue registrada`,
          mensaje: titulo,
          referencia_tipo: 'incidencia',
          referencia_id: incidencia.id,
        });
      } catch (notifyErr) { /* la incidencia ya quedo guardada; no se bloquea por un fallo al notificar */ }

      // Si la incidencia es publica (visibilidad "comunidad"), el resto
      // de los residentes tambien debe enterarse, no solo quien la
      // reporto (se pidio explicitamente: "si una incidencia es publica
      // deberia aparecer en notificaciones"). Pero si todavia esta
      // pendiente de aprobacion, NO se avisa a todo el residencial --
      // eso equivaldria a publicarla antes de que guardia/admin
      // confirmen que es un reporte real, justo lo que este flujo de
      // aprobacion busca evitar.
      if (incidencia.visibilidad === 'comunidad' && incidencia.residencial_id && estadoInicial !== 'pendiente_aprobacion') {
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

  // Aprobar o rechazar un reporte de residente que quedo en
  // "pendiente_aprobacion" -- separado del PATCH generico de abajo para
  // que el efecto de sancionar SOLO pueda dispararse por esta via, con
  // sus propias reglas (quien puede, desde que estado, motivo
  // obligatorio al rechazar), en vez de depender de que el PATCH
  // generico reciba por casualidad los campos correctos.
  router.patch(`/${pkPath}/revisar`, async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (!['guardia', 'admin', 'superadmin'].includes(req.user.rol_codigo)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo guardia o administración pueden revisar reportes.' });
      }
      const where = primaryKeyWhere(model, req.params);
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where, transaction });
      if (!row) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Incidencia no encontrada.' });
      }
      if (row.estado !== 'pendiente_aprobacion') {
        await transaction.rollback();
        return res.status(400).json({ error: 'Esta incidencia ya fue revisada, o no necesitaba revisión.' });
      }

      const aprobar = Boolean(req.body.aprobar);
      const motivo = String(req.body.motivo || '').trim();
      if (!aprobar && !motivo) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Escribe el motivo del rechazo.' });
      }

      // Sancionar es la accion mas fuerte de las dos (queda en el
      // historial del usuario) -- se deja solo para admin/superadmin,
      // no para guardia, aunque guardia si pueda aprobar/rechazar sin
      // sancionar. Si un guardia de todas formas manda sancionar:true,
      // se ignora en silencio en vez de rechazar toda la revision -- el
      // rechazo del reporte (lo que si pidio) sigue adelante igual.
      const puedeSancionar = ['admin', 'superadmin'].includes(req.user.rol_codigo);
      const sancionar = !aprobar && puedeSancionar && Boolean(req.body.sancionar);

      const nuevoEstado = aprobar ? 'reportada' : 'rechazada';
      await row.update({
        estado: nuevoEstado,
        motivo_rechazo: aprobar ? null : motivo,
      }, { transaction });

      await db.IncidenciasSeguimiento.create({
        incidencia_id: row.id,
        usuario_id: req.user.id,
        comentario: aprobar ? 'Reporte aprobado.' : `Reporte rechazado: ${motivo}`,
        estado_anterior: 'pendiente_aprobacion',
        estado_nuevo: nuevoEstado,
      }, { transaction });

      let sancion = null;
      if (sancionar) {
        sancion = await db.SancionesUsuarios.create({
          usuario_id: row.reportado_por,
          incidencia_id: row.id,
          motivo: `Incidencia ${folio(row)} rechazada: ${motivo}`,
          aplicado_por: req.user.id,
        }, { transaction });
      }

      await transaction.commit();

      try {
        await notificacionesService.crear({
          usuario_id: row.reportado_por,
          tipo: 'incidencia',
          titulo: aprobar
            ? `Tu incidencia ${folio(row)} fue aprobada`
            : `Tu incidencia ${folio(row)} fue rechazada`,
          mensaje: aprobar ? row.titulo : motivo,
          referencia_tipo: 'incidencia',
          referencia_id: row.id,
        });
        if (sancion) {
          await notificacionesService.crear({
            usuario_id: row.reportado_por,
            tipo: 'incidencia',
            titulo: 'Recibiste una sanción',
            mensaje: sancion.motivo,
            referencia_tipo: 'incidencia',
            referencia_id: row.id,
          });
        }
      } catch (notifyErr) { /* la revision ya quedo guardada; no se bloquea por un fallo al notificar */ }

      res.json({ data: row, sancion });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
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
      // La aprobacion/rechazo tiene su propia ruta (arriba, "/revisar")
      // porque ahi es donde se decide si ademas se sanciona al usuario
      // -- si el PATCH generico pudiera sacar una incidencia de
      // "pendiente_aprobacion" tambien, alguien podria saltarse esa
      // revision (y la posible sancion) con una llamada mas simple.
      if (row.estado === 'pendiente_aprobacion') {
        return res.status(400).json({ error: 'Esta incidencia esta pendiente de aprobación. Usa la acción de aprobar/rechazar.' });
      }
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
