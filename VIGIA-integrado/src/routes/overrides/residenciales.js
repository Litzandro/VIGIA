'use strict';

const db = require('../../models');
const { sembrarTiposIncidenciaDefecto } = require('../../utils/catalogoTiposIncidencia');

module.exports = function residencialesOverride({ router, model, handlers, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = req.user.rol_codigo === 'superadmin'
        ? {}
        : { id: req.user.residencial_id };
      const rows = await model.findAll({ where, order: [['nombre', 'ASC']] });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (req.user.rol_codigo !== 'superadmin') {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo superadministración puede crear clientes residenciales.' });
      }
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El nombre de la residencial es requerido.' });
      }
      // Antes se podian crear 2 residenciales con el mismo nombre sin
      // ningun aviso (paso de verdad: dos "CEUTEC" separadas, sin forma
      // clara de saber cual suscripcion pertenecia a cual). No aplica a
      // las que ya existen -- solo evita que se repita de aqui en
      // adelante. Comparacion sin distinguir mayusculas/minusculas para
      // que "Ceutec" y "CEUTEC" tambien cuenten como duplicado.
      const duplicada = await model.findOne({
        where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('nombre')), nombre.toLowerCase()),
      });
      if (duplicada) {
        await transaction.rollback();
        return res.status(400).json({ error: `Ya existe una residencial llamada "${duplicada.nombre}". Usa un nombre distinto (ej. agregando la ciudad o sede).` });
      }
      const row = await model.create({
        nombre,
        direccion: req.body.direccion || null,
        ciudad: req.body.ciudad || null,
        pais: req.body.pais || 'Honduras',
        telefono_contacto: req.body.telefono_contacto || null,
        email_contacto: req.body.email_contacto || null,
        zona_horaria: req.body.zona_horaria || 'America/Tegucigalpa',
        logo_url: req.body.logo_url || null,
        activo: true,
      }, { transaction });
      await db.ConfiguracionesResidencial.create({
        residencial_id: row.id,
        zona_horaria: row.zona_horaria,
        tiempo_objetivo_acceso_seg: 90,
        limite_cola_alerta: 5,
        tolerancia_turno_min: 15,
        tiempo_sesion_inactiva_min: 30,
      }, { transaction });
      await db.PuntosAcceso.create({ residencial_id: row.id, nombre: 'Garita principal', tipo: 'mixto', activo: true }, { transaction });
      await sembrarTiposIncidenciaDefecto(db, row.id, transaction);
      const plan = await db.PlanesServicio.findOne({ where: { codigo: 'esencial', activo: true }, transaction });
      if (plan) {
        const start = new Date();
        const trialEnd = new Date(start); trialEnd.setDate(trialEnd.getDate() + 15);
        await db.Suscripciones.create({
          residencial_id: row.id,
          plan_id: plan.id,
          estado: 'prueba',
          fecha_inicio: start,
          fecha_fin_prueba: trialEnd,
          ciclo: 'mensual',
          precio_acordado: plan.precio_mensual,
          notas: 'Prueba inicial creada automáticamente.',
        }, { transaction });
      }
      await transaction.commit();
      res.status(201).json({ data: row, mensaje: 'Residencial creada con garita, configuración y prueba inicial.' });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      if (req.user.rol_codigo !== 'superadmin' && String(req.params.id) !== String(req.user.residencial_id)) return res.status(403).json({ error: 'No puedes consultar otra residencial.' });
      return handlers.getOne(req, res, next);
    } catch (err) { next(err); }
  });
  async function actualizar(req, res, next) {
    try {
      if (req.body && req.body.nombre) {
        const nombre = String(req.body.nombre).trim();
        const duplicada = await model.findOne({
          where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('nombre')), nombre.toLowerCase()),
        });
        if (duplicada && String(duplicada.id) !== String(req.params.id)) {
          return res.status(400).json({ error: `Ya existe una residencial llamada "${duplicada.nombre}". Usa un nombre distinto (ej. agregando la ciudad o sede).` });
        }
      }
      return handlers.update(req, res, next);
    } catch (err) { next(err); }
  }
  router.put(`/${pkPath}`, actualizar);
  router.patch(`/${pkPath}`, actualizar);
  router.delete(`/${pkPath}`, handlers.remove);

  // ---------- BORRADO PERMANENTE (residencial + todo lo que contiene) ----------
  // El DELETE de arriba (handlers.remove, del CRUD generico) es un
  // borrado LOGICO: como "residenciales" tiene columna "activo", solo
  // apaga esa bandera -- la fila y todo lo demas se queda intacto en la
  // base de datos. Esto es aparte: borra la residencial de verdad, junto
  // con TODO lo que le pertenece (usuarios, guardias, turnos,
  // incidencias, accesos, camaras, viviendas, conversaciones... todo).
  // No hay forma de deshacer esto.
  //
  // El esquema (database/vigia_schema.sql) ya tiene "ON DELETE CASCADE"
  // en la enorme mayoria de tablas que dependen de residencial_id, asi
  // que en teoria borrar la fila de "residenciales" alcanzaria solo. El
  // problema es que unas pocas columnas se dejaron a proposito en
  // "ON DELETE RESTRICT" (para nunca perder de vista quien reporto una
  // incidencia o quien recibio un acceso, aunque ese usuario ya no
  // exista) -- y la mas importante, usuarios.residencial_id, es
  // TAMBIEN restrict: mientras exista un solo usuario de esta
  // residencial, MySQL se niega a borrar la fila de "residenciales".
  // Por eso este borrado va en un orden especifico: primero las tablas
  // que RESTRINGEN el borrado de un usuario (evidencias_acceso, accesos,
  // incidencias, paquetes, vetos_acceso, turnos_guardia -- todas con su
  // propia columna residencial_id) y las 2 que ni siquiera tienen
  // residencial_id propio (incidencias_seguimiento y sanciones_usuarios,
  // ligadas solo a un usuario_id) -- despues los usuarios -- y al final
  // la residencial misma, momento en el que MySQL cascadea solo el
  // resto (guardias, viviendas, camaras, conversaciones, plantillas de
  // turno, suscripciones, etc.).
  router.delete(`/${pkPath}/permanente`, async (req, res, next) => {
    if (req.user.rol_codigo !== 'superadmin') {
      return res.status(403).json({ error: 'Solo superadministración puede borrar una residencial permanentemente.' });
    }
    const transaction = await db.sequelize.transaction();
    try {
      const residencial = await model.findByPk(req.params.id, { transaction });
      if (!residencial) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Residencial no encontrada.' });
      }

      // Confirmacion server-side: no basta con un confirm() del
      // navegador -- el body tiene que traer el nombre EXACTO de la
      // residencial (como ya esta guardado, sin importar mayusculas ni
      // espacios de mas). Evita un borrado accidental por un clic de
      // mas o una llamada automatizada sin intencion real.
      const confirmacion = String(req.body.confirmar || '').trim().toLowerCase();
      if (confirmacion !== residencial.nombre.trim().toLowerCase()) {
        await transaction.rollback();
        return res.status(400).json({ error: `Para confirmar, "confirmar" debe ser exactamente el nombre de la residencial: "${residencial.nombre}".` });
      }

      const usuarios = await db.Usuarios.findAll({ where: { residencial_id: residencial.id }, attributes: ['id'], transaction });
      const usuarioIds = usuarios.map((u) => u.id);

      // 1) Tablas con su propia residencial_id que RESTRINGEN usuarios.
      const TABLAS_RESTRICT_POR_RESIDENCIAL = [
        'evidencias_acceso', 'accesos', 'incidencias', 'paquetes', 'vetos_acceso', 'turnos_guardia',
      ];
      for (const tabla of TABLAS_RESTRICT_POR_RESIDENCIAL) {
        await db.sequelize.query(`DELETE FROM ${tabla} WHERE residencial_id = :id`, {
          replacements: { id: residencial.id },
          transaction,
        });
      }

      // 2) Tablas que restringen usuarios pero NO tienen residencial_id
      // propia (solo se llega a ellas a traves del usuario). Redundante
      // con el cascade de "incidencias" de arriba en el caso normal,
      // pero se deja explicito por si alguna vez existiera una fila
      // huerfana (usuario de esta residencial, incidencia de otra).
      if (usuarioIds.length) {
        await db.sequelize.query('DELETE FROM incidencias_seguimiento WHERE usuario_id IN (:ids)', { replacements: { ids: usuarioIds }, transaction });
        await db.sequelize.query('DELETE FROM sanciones_usuarios WHERE usuario_id IN (:ids) OR aplicado_por IN (:ids)', { replacements: { ids: usuarioIds }, transaction });
      }

      // 3) Ahora si, los usuarios de esta residencial (guardias,
      // admins, residentes...). El resto de sus datos personales
      // (sesiones, notificaciones, mensajes, preferencias, etc.) tiene
      // CASCADE directo desde usuarios, asi que se van solos.
      await db.sequelize.query('DELETE FROM usuarios WHERE residencial_id = :id', { replacements: { id: residencial.id }, transaction });

      // 4) La residencial misma: cascadea automaticamente todo lo demas
      // que le pertenece (guardias, viviendas, puntos de acceso,
      // camaras, visitantes frecuentes, invitaciones, vehiculos,
      // alertas de panico, conversaciones y mensajes, reportes,
      // configuracion, personas autorizadas, conflictos de permisos,
      // plantillas de turno, cola de acceso, suscripciones, contactos
      // de emergencia, publicaciones de comunidad, tipos de incidencia).
      const nombreBorrado = residencial.nombre;
      await residencial.destroy({ transaction });

      await transaction.commit();
      res.json({
        mensaje: `Residencial "${nombreBorrado}" y todos sus datos fueron eliminados permanentemente.`,
        usuarios_eliminados: usuarioIds.length,
      });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });
};
