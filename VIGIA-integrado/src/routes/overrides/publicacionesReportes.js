'use strict';

// Reportar una publicacion del muro de vecinos (el boton "Reportar
// publicacion" que ya existia en comunidad.js, pero apuntaba a un
// modal que nunca se agrego al HTML y a una tabla que nunca se creo en
// la base -- ver database/vigia_schema.sql para el detalle completo).
//
// Reglas de este override sobre el CRUD generico:
//   - "reportado_por" SIEMPRE se toma de la sesion, nunca de lo que
//     mande el cliente -- sin esto, cualquiera podria reportar "como"
//     otro usuario con solo cambiar el body de la peticion.
//   - Se verifica que la publicacion exista y sea de la misma
//     residencial de quien reporta (mismo criterio que ya se aplico en
//     personas_autorizadas.residente_id).
//   - Cualquiera con sesion puede CREAR un reporte (residente, guardia
//     o administracion, si ven algo inapropiado). Pero LEER la lista
//     cruda de reportes (con quien reporto que, y por que) queda solo
//     para admin/superadmin -- la bandeja de moderacion normal es
//     GET /publicaciones-comunidad/reportadas, que ya exige eso mismo;
//     este endpoint generico no deberia ser mas permisivo que ese.

const db = require('../../models');

module.exports = function publicacionesReportesOverride({ router, model, handlers, pkPath }) {
  router.post('/', async (req, res, next) => {
    try {
      const publicacionId = req.body.publicacion_id;
      if (!publicacionId) return res.status(400).json({ error: 'Falta indicar que publicacion se reporta.' });

      const publicacion = await db.PublicacionesComunidad.findOne({
        where: { id: publicacionId, residencial_id: req.user.residencial_id },
      });
      if (!publicacion) return res.status(404).json({ error: 'Esa publicacion no existe o no pertenece a tu residencial.' });

      const motivosValidos = ['spam', 'ofensivo', 'acoso', 'informacion_falsa', 'otro'];
      if (!motivosValidos.includes(req.body.motivo)) {
        return res.status(400).json({ error: 'Selecciona un motivo valido para el reporte.' });
      }

      const row = await model.create({
        publicacion_id: publicacionId,
        reportado_por: req.user.id,
        motivo: req.body.motivo,
        comentario: req.body.comentario ? String(req.body.comentario).trim().slice(0, 255) : null,
      });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.rol_codigo)) {
        return res.status(403).json({ error: 'Solo administracion puede consultar los reportes.' });
      }
      // No se usa el CRUD generico aqui a proposito: esta tabla no
      // tiene columna residencial_id propia (el aislamiento
      // multi-residencial normal, applyOwnershipScope, no tiene nada
      // que filtrar), asi que sin este include+where un admin de una
      // residencial podria ver reportes de publicaciones de otra
      // residencial por completo. Se filtra a traves de la publicacion
      // asociada en su lugar.
      const wherePublicacion = req.user.rol_codigo === 'superadmin' ? {} : { residencial_id: req.user.residencial_id };
      const rows = await model.findAll({
        include: [{ model: db.PublicacionesComunidad, as: 'publicacion', where: wherePublicacion, attributes: ['id', 'contenido', 'categoria'] }],
        order: [['fecha_creacion', 'DESC']],
        limit: 200,
      });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });

  // Sin ruta individual GET /:id a proposito: nada en el frontend
  // necesita pedir un reporte suelto por id (la bandeja de moderacion
  // usa /publicaciones-comunidad/reportadas, y el listado de arriba ya
  // trae todo). Exponerla igual arrastraria el mismo problema de
  // aislamiento que /:id generico (sin residencial_id propio, no hay
  // nada que impida a un admin pedir directo el id de un reporte de
  // otra residencial). Se bloquean tambien edicion y borrado: un
  // reporte es un registro de moderacion, se conserva igual que un
  // mensaje (ver mensajes.js), no se edita ni se borra.
  router.get(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Usa GET /publicaciones-reportes.' }));
  router.put(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los reportes no se editan.' }));
  router.patch(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los reportes no se editan.' }));
  router.delete(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los reportes se conservan para trazabilidad.' }));
};
