'use strict';

const db = require('../../models');
const { validarImagenBase64 } = require('../../utils/imagenValidator');

// Antes esta tabla no tenia override propio: quedaba con el CRUD
// generico completo (GET/POST/PUT/PATCH/DELETE genericos de
// crudFactory.js), sin ningun limite ni validacion de contenido en el
// POST. Eso dejaba dos huecos reales, aunque el flujo normal (reportar
// una incidencia desde incidencias.js, que SI valida y adjunta como
// mucho una evidencia al crear) se viera bien:
//   1) Cualquier usuario con el permiso "incidencias.reportar" podia
//      llamar POST /api/incidencias-evidencias directo, sin pasar por
//      incidencias.js, y colgarle evidencias ilimitadas a CUALQUIER
//      incidencia_id (ni siquiera tenia que ser una incidencia propia) --
//      nada revisaba que el contenido fuera una imagen de verdad
//      (validarImagenBase64 solo se llamaba desde incidencias.js).
//   2) No habia ningun tope: se podian mandar cientos de evidencias a
//      una misma incidencia una tras otra.
// Este override reemplaza por completo el CRUD generico de esta tabla
// (igual que cualquier otro override) y agrega esas dos reglas antes
// de crear.
const MAX_EVIDENCIAS_POR_INCIDENCIA = 5;

module.exports = function incidenciasEvidenciasOverride({ router, model, handlers, pkPath }) {
  async function incidenciaVisible(req, incidenciaId) {
    const where = { id: incidenciaId };
    if (req.user.rol_codigo !== 'superadmin') where.residencial_id = req.user.residencial_id;
    return db.Incidencias.findOne({ where });
  }

  router.get('/', handlers.list);
  router.get(`/${pkPath}`, handlers.getOne);

  router.post('/', async (req, res, next) => {
    try {
      const incidenciaId = req.body.incidencia_id;
      if (!incidenciaId) return res.status(400).json({ error: 'incidencia_id es requerido.' });

      const incidencia = await incidenciaVisible(req, incidenciaId);
      if (!incidencia) return res.status(404).json({ error: 'Incidencia no encontrada.' });

      // Solo quien reporto la incidencia, o guardia/admin/superadmin,
      // puede adjuntarle evidencia -- sin esto cualquier residente podia
      // colgarle "evidencia" a la incidencia de otro vecino.
      const puedeAdjuntar = ['guardia', 'admin', 'superadmin'].includes(req.user.rol_codigo)
        || String(incidencia.reportado_por) === String(req.user.id);
      if (!puedeAdjuntar) {
        return res.status(403).json({ error: 'No puedes adjuntar evidencia a una incidencia que no reportaste.' });
      }

      const yaAdjuntas = await model.count({ where: { incidencia_id: incidenciaId } });
      if (yaAdjuntas >= MAX_EVIDENCIAS_POR_INCIDENCIA) {
        return res.status(400).json({ error: `Esta incidencia ya tiene el máximo de ${MAX_EVIDENCIAS_POR_INCIDENCIA} evidencias adjuntas.` });
      }

      const urlArchivo = req.body.url_archivo;
      if (!urlArchivo) return res.status(400).json({ error: 'url_archivo es requerido.' });
      if (String(urlArchivo).length > 1500000) {
        return res.status(413).json({ error: 'El archivo es demasiado grande. Usa una imagen comprimida.' });
      }
      const tipoArchivo = req.body.tipo_archivo || 'imagen';
      if (tipoArchivo === 'imagen') {
        const chequeo = validarImagenBase64(urlArchivo);
        if (!chequeo.ok) return res.status(400).json({ error: chequeo.error });
      }

      const row = await model.create({
        incidencia_id: incidenciaId,
        tipo_archivo: tipoArchivo,
        url_archivo: urlArchivo,
        camara_id: req.body.camara_id || null,
        grabacion_id: req.body.grabacion_id || null,
      });
      res.status(201).json({ data: row });
    } catch (err) { next(err); }
  });

  // Nadie edita una evidencia ya subida (no tendria sentido); solo
  // guardia/admin/superadmin pueden borrarla (ej. si se subio por
  // error o es contenido inapropiado) -- ya protegido por
  // resourcePermissions.js (accion "remove"), aca solo se quita
  // update/replace del generico para no dejarlo expuesto sin razon.
  router.delete(`/${pkPath}`, handlers.remove);
};
