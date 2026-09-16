'use strict';

// Camaras: el admin de cada residencial registra sus propias camaras
// (URL de transmision, protocolo, credenciales opcionales) sin
// depender del equipo de VIGIA. Este override reemplaza el CRUD
// generico solo para poder:
//   1) Cifrar la contrasena de conexion (clave_stream) antes de
//      guardarla -- nunca se guarda en texto plano.
//   2) Nunca devolver esa contrasena cifrada al navegador -- ni
//      siquiera cifrada hace falta mandarla, el frontend no la usa
//      para nada (no reproduce el stream re-armando credenciales, ver
//      camaras.js).
// El resto (list/getOne/remove) usa el mismo scoping multi-residencial
// que cualquier otro recurso -- residencial_id se toma siempre de la
// sesion, nunca de lo que mande el cliente.

const { applyOwnershipOnCreate, applyOwnershipScope, primaryKeyWhere, hasSoftDelete } = require('../../utils/crudFactory');
const { validarCampos } = require('../../config/resourceValidation');
const { cifrar } = require('../../utils/camaraCrypto');

const ATRIBUTOS_OCULTOS = ['clave_stream_cifrada'];

// Separa "clave_stream" (texto plano, solo de entrada) del resto del
// body, y si viene con contenido la reemplaza por su version cifrada
// en "clave_stream_cifrada" (la columna real del modelo). Si no viene
// (por ejemplo, al editar una camara sin tocar la contrasena), no se
// toca lo que ya estaba guardado.
function prepararDatos(body) {
  const data = { ...(body || {}) };
  const claveTexto = data.clave_stream;
  delete data.clave_stream;
  if (claveTexto !== undefined) {
    data.clave_stream_cifrada = claveTexto ? cifrar(claveTexto) : null;
  }
  return data;
}

module.exports = function camarasOverride({ router, model, pkPath }) {
  router.get('/', async (req, res, next) => {
    try {
      const where = applyOwnershipScope(model, req.user, {});
      const rows = await model.findAll({
        where,
        attributes: { exclude: ATRIBUTOS_OCULTOS },
        order: [['fecha_creacion', 'ASC']],
      });
      res.json({ data: rows });
    } catch (err) { next(err); }
  });

  router.get(`/${pkPath}`, async (req, res, next) => {
    try {
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const row = await model.findOne({ where, attributes: { exclude: ATRIBUTOS_OCULTOS } });
      if (!row) return res.status(404).json({ error: 'Camara no encontrada' });
      res.json({ data: row });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const data = applyOwnershipOnCreate(model, req.user, prepararDatos(req.body));
      // applyOwnershipOnCreate solo rellena residencial_id automaticamente
      // para roles con una residencial fija (admin) -- el superadmin no
      // tiene una propia, asi que debe mandarla el mismo en el body (el
      // formulario le muestra un selector aparte para esto). Sin este
      // resguardo, lo que se veia antes era un "Datos invalidos" opaco
      // (el rechazo real de Sequelize por el NOT NULL de la columna, que
      // el frontend no sabe explicar porque no llega en el formato que
      // espera "detalle").
      if (!data.residencial_id) {
        const msg = req.user && req.user.rol_codigo === 'superadmin'
          ? 'Selecciona a que residencial pertenece esta camara.'
          : 'Falta la residencial de esta camara.';
        return res.status(400).json({ error: 'Datos invalidos', detalle: msg, detalles: [msg] });
      }
      const errores = validarCampos(model, data);
      if (errores.length) {
        return res.status(400).json({ error: 'Datos invalidos', detalle: errores.join('; '), detalles: errores });
      }
      const row = await model.create(data);
      const limpio = row.toJSON();
      ATRIBUTOS_OCULTOS.forEach((attr) => delete limpio[attr]);
      res.status(201).json({ data: limpio });
    } catch (err) { next(err); }
  });

  async function actualizar(req, res, next) {
    try {
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Camara no encontrada' });

      const data = prepararDatos(req.body);
      // Igual que en el resto del sistema: nunca se deja mover una
      // camara a otra residencial cambiando residencial_id a mano en
      // el body de una edicion.
      if (req.user && req.user.rol_codigo !== 'superadmin') delete data.residencial_id;

      const errores = validarCampos(model, data);
      if (errores.length) {
        return res.status(400).json({ error: 'Datos invalidos', detalle: errores.join('; '), detalles: errores });
      }
      await row.update(data);
      const limpio = row.toJSON();
      ATRIBUTOS_OCULTOS.forEach((attr) => delete limpio[attr]);
      res.json({ data: limpio });
    } catch (err) { next(err); }
  }
  router.put(`/${pkPath}`, actualizar);
  router.patch(`/${pkPath}`, actualizar);

  router.delete(`/${pkPath}`, async (req, res, next) => {
    try {
      let where = primaryKeyWhere(model, req.params);
      where = applyOwnershipScope(model, req.user, where);
      const row = await model.findOne({ where });
      if (!row) return res.status(404).json({ error: 'Camara no encontrada' });

      if (hasSoftDelete(model)) {
        await row.update({ activo: false, estado: 'inactiva' });
        return res.json({ data: row, mensaje: 'Camara desactivada' });
      }
      await row.destroy();
      return res.status(204).send();
    } catch (err) { next(err); }
  });
};
