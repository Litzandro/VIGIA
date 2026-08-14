'use strict';

const bcrypt = require('bcryptjs');
const db = require('../../models');

// Agrega /me sobre el CRUD generico de usuarios: cualquier usuario
// logueado puede ver/editar SU PROPIO perfil sin necesitar el permiso
// "usuarios.gestionar" (que solo tienen admin/superadmin). Importante:
// va montado ANTES que la ruta generica "/:id", porque si no Express
// interpretaria "me" como si fuera un id.
//
// No se permite cambiar password_hash, rol_id, residencial_id o estado
// desde /me (eso s solo lo puede tocar quien tenga usuarios.gestionar,
// via el endpoint generico PUT /api/usuarios/:id).

module.exports = function usuariosOverride({ router, model, handlers, pkPath }) {
  // Alta real desde el portal administrativo. Recibe una contraseña normal,
  // la cifra en el servidor y crea el perfil de guardia o residente en una
  // única transacción.
  router.post('/admin-create', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo administración puede crear cuentas.' });
      }
      const { nombre, apellido, email, password, rol_codigo } = req.body || {};
      if (!nombre || !apellido || !email || !password || !rol_codigo) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Nombre, apellido, correo, contraseña y rol son requeridos.' });
      }
      if (String(password).length < 8) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      }
      if (!['residente', 'guardia', 'admin'].includes(rol_codigo)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Rol no permitido para esta operación.' });
      }
      const rol = await db.Roles.findOne({ where: { codigo: rol_codigo }, transaction });
      if (!rol) throw new Error('El rol seleccionado no existe.');
      const residencialId = req.user.rol_codigo === 'superadmin' ? req.body.residencial_id : req.user.residencial_id;
      if (!residencialId) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecciona una residencial.' });
      }
      const exists = await model.findOne({ where: { email: String(email).trim().toLowerCase() }, transaction });
      if (exists) {
        await transaction.rollback();
        return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
      }
      const usuario = await model.create({
        residencial_id: residencialId,
        rol_id: rol.id,
        nombre: String(nombre).trim(),
        apellido: String(apellido).trim(),
        email: String(email).trim().toLowerCase(),
        telefono: req.body.telefono || null,
        password_hash: await bcrypt.hash(String(password), 10),
        estado: 'activo',
        debe_cambiar_clave: true,
        creado_por: req.user.id,
      }, { transaction });

      if (rol_codigo === 'guardia') {
        await db.Guardias.create({
          usuario_id: usuario.id,
          residencial_id: residencialId,
          numero_empleado: req.body.numero_empleado || null,
          turno: req.body.turno || 'rotativo',
        }, { transaction });
      }
      if (rol_codigo === 'residente') {
        let viviendaId = req.body.vivienda_id || null;
        if (!viviendaId && req.body.numero_vivienda) {
          const [vivienda] = await db.Viviendas.findOrCreate({
            where: { residencial_id: residencialId, numero: String(req.body.numero_vivienda).trim() },
            defaults: { bloque_torre: req.body.bloque_torre || null, tipo: req.body.tipo_vivienda || 'casa', activo: true },
            transaction,
          });
          viviendaId = vivienda.id;
        }
        if (!viviendaId) {
          await transaction.rollback();
          return res.status(400).json({ error: 'El residente necesita una vivienda.' });
        }
        await db.Residentes.create({
          usuario_id: usuario.id,
          vivienda_id: viviendaId,
          tipo_residente: req.body.tipo_residente || 'propietario',
          fecha_ingreso: new Date(),
        }, { transaction });
      }
      await transaction.commit();
      const clean = usuario.toJSON(); delete clean.password_hash;
      res.status(201).json({ data: clean });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      next(err);
    }
  });
  router.get('/me', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });
      const usuario = await model.findByPk(req.user.id, {
        include: [{ model: db.Residenciales, as: 'residencial', attributes: ['id', 'nombre'] }],
      });
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
      const data = usuario.toJSON(); delete data.password_hash;

      // Requisito perfil.html: mostrar la unidad real (torre/bloque +
      // numero) en vez de un dato inventado. Solo aplica a residentes;
      // guardia/admin/superadmin no tienen fila en "residentes".
      if (req.user.rol_codigo === 'residente') {
        const residente = await db.Residentes.findByPk(req.user.id, {
          include: [{ model: db.Viviendas, as: 'vivienda', attributes: ['numero', 'bloque_torre'] }],
        });
        if (residente && residente.vivienda) {
          const { numero, bloque_torre } = residente.vivienda;
          data.unidad = bloque_torre ? `${bloque_torre} · ${numero}` : numero;
        }
      }

      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/me', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'No autenticado' });
      const usuario = await model.findByPk(req.user.id);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      const { password_hash, rol_id, residencial_id, estado, ...permitido } = req.body || {};
      await usuario.update(permitido);
      const data = usuario.toJSON(); delete data.password_hash;
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const where = req.user.rol_codigo === 'superadmin' ? {} : { residencial_id: req.user.residencial_id };
      if (req.query.estado) where.estado = req.query.estado;
      const rows = await model.findAll({ where, attributes: { exclude: ['password_hash'] }, order: [['fecha_creacion', 'DESC']], limit: 500 });
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (err) { next(err); }
  });
  router.post('/', (req, res) => res.status(405).json({ error: 'Usa /api/usuarios/admin-create para crear cuentas de forma segura.' }));
  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where, attributes: { exclude: ['password_hash'] } });
      if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
      res.json({ data: row });
    } catch (err) { next(err); }
  });
  const adminUpdate = async (req, res, next) => {
    try {
      const where = { id: req.params.id };
      if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const allowed = {};
      ['nombre','apellido','email','telefono','foto_url','estado','debe_cambiar_clave'].forEach(k=>{ if(req.body[k]!==undefined) allowed[k]=req.body[k]; });
      if (req.user.rol_codigo === 'superadmin') {
        if (req.body.rol_id !== undefined) allowed.rol_id = req.body.rol_id;
        if (req.body.residencial_id !== undefined) allowed.residencial_id = req.body.residencial_id;
      }
      await row.update(allowed);
      const data=row.toJSON();delete data.password_hash;
      res.json({ data });
    } catch (err) { next(err); }
  };
  router.put(`/${pkPath}`, adminUpdate);
  router.patch(`/${pkPath}`, adminUpdate);
  router.delete(`/${pkPath}`, handlers.remove);
};
