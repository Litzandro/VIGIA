'use strict';

// Antes esta tabla no tenia override: pasaba por el CRUD generico
// (src/utils/crudFactory.js), que hace `row.update(req.body)` sin filtrar
// campos y sin validar que el nuevo "estado" sea uno de los valores del
// enum ni que la transicion tenga sentido. En la practica eso permitia
// que cualquier cliente autorizado a escribir conflictos_permisos:
//   - Enviara resuelto_por / fecha_resolucion a mano (el frontend hoy los
//     manda igual, ver public/js/conflictos.js), dejando que el CLIENTE
//     decida quien aparece como responsable y cuando se resolvio, en vez
//     de que lo decida el servidor con datos del token/reloj del server.
//   - Reescribiera residencial_id, veto_id o persona_autorizada_id de un
//     conflicto ya creado.
//   - Pusiera un "estado" fuera del enum, o pasara un conflicto "cerrado"
//     de vuelta a "abierto" sin pasar por revision.
// El veto correspondiente (vetosAcceso.js) ya resuelve estos mismos
// problemas para su propia tabla; este override aplica el mismo criterio
// aca, manteniendo el estilo ya usado en el resto del proyecto.

const { CONFLICTO_ESTADO, esAdmin, esSuperadmin } = require('../../config/estados');

const ESTADOS_RESOLUCION = [
  CONFLICTO_ESTADO.RESUELTO_AUTORIZAR,
  CONFLICTO_ESTADO.RESUELTO_BLOQUEAR,
  CONFLICTO_ESTADO.CERRADO,
];

const ESTADOS_ABIERTOS = [CONFLICTO_ESTADO.ABIERTO, CONFLICTO_ESTADO.EN_REVISION];

// Regla de negocio pura (sin Express, sin Sequelize): dado el conflicto
// actual y lo que mando el cliente, decide si la resolucion es valida y
// que patch aplicar. Separarla del handler HTTP permite probarla con
// datos de ejemplo (ver tests/conflictosPermisos.reglas.test.js) sin
// levantar servidor ni base de datos, y deja el handler enfocado solo en
// autenticacion/autorizacion + I/O.
function evaluarResolucion(row, body, resolutorId) {
  if (!ESTADOS_ABIERTOS.includes(row.estado)) {
    return { ok: false, status: 400, error: `Este conflicto ya está en estado "${row.estado}" y no se puede resolver de nuevo.` };
  }
  if (!ESTADOS_RESOLUCION.includes(body.estado)) {
    return { ok: false, status: 400, error: `Estado inválido. Debe ser uno de: ${ESTADOS_RESOLUCION.join(', ')}.` };
  }
  const resolucion = String(body.resolucion || '').trim();
  if (!resolucion) {
    return { ok: false, status: 400, error: 'Escribe una resolución antes de cerrar el conflicto.' };
  }
  // resuelto_por y fecha_resolucion los fija el servidor (usuario del
  // token y reloj del servidor): el cliente puede mandarlos (el frontend
  // actual lo hace en public/js/conflictos.js), pero se ignoran a
  // proposito para que no sean falseables.
  return {
    ok: true,
    patch: { estado: body.estado, resolucion, resuelto_por: resolutorId, fecha_resolucion: new Date() },
  };
}

module.exports = function conflictosPermisosOverride({ router, model, handlers, pkPath }) {
  router.get('/', handlers.list);
  router.post('/', handlers.create);
  router.get(`/${pkPath}`, handlers.getOne);

  router.patch(`/${pkPath}`, async (req, res, next) => {
    try {
      if (!esAdmin(req.user)) {
        return res.status(403).json({ error: 'Solo administración puede resolver un conflicto.' });
      }
      const where = { id: req.params.id };
      if (!esSuperadmin(req.user)) where.residencial_id = req.user.residencial_id;
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Conflicto no encontrado.' });

      const resultado = evaluarResolucion(row, req.body, req.user.id);
      if (!resultado.ok) return res.status(resultado.status).json({ error: resultado.error });

      await row.update(resultado.patch);
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.delete(`/${pkPath}`, handlers.remove);
};

// Se expone para pruebas unitarias sin DB (ver tests/conflictosPermisos.reglas.test.js).
module.exports.evaluarResolucion = evaluarResolucion;
