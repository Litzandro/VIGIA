'use strict';

// Catalogo por defecto de tipos_incidencia. Antes NINGUNA residencial
// nueva quedaba con tipos de incidencia sembrados -- ni el registro
// publico (authController.js -> register) ni el alta que hace
// superadmin (src/routes/overrides/residenciales.js) creaban ni una
// sola fila en tipos_incidencia, a pesar de que si sembraban
// ConfiguracionesResidencial, una garita ("Garita principal") y una
// suscripcion de prueba para toda residencial nueva.
//
// El problema real, no solo cosmetico: src/routes/overrides/incidencias.js
// exige un tipo_incidencia_id para poder crear una incidencia, y si no
// se manda uno intenta usar el tipo llamado exactamente "Otro" como
// respaldo -- si esa fila no existe, la creacion de CUALQUIER incidencia
// falla con "No existe un tipo de incidencia disponible.". Una
// residencial nueva (via registro publico) quedaba, sin que nadie lo
// notara, sin poder reportar ni una sola incidencia hasta que alguien
// entrara a mano a crear tipos.
//
// "Otro" tiene que estar en esta lista si o si -- es el nombre exacto
// que el codigo ya busca como respaldo.
const CATALOGO_TIPOS_INCIDENCIA_DEFECTO = [
  { nombre: 'Robo', nivel_urgencia: 'critico' },
  { nombre: 'Incendio', nivel_urgencia: 'critico' },
  { nombre: 'Médico', nivel_urgencia: 'critico' },
  { nombre: 'Accidente', nivel_urgencia: 'alto' },
  { nombre: 'Sospechoso', nivel_urgencia: 'medio' },
  { nombre: 'Otro', nivel_urgencia: 'medio' },
];

// Crea el catalogo por defecto para una residencial. Idempotente: si
// llamado dos veces (o corrido sobre una residencial que YA tenia algun
// tipo cargado a mano) no duplica nada, porque solo inserta los nombres
// que todavia no existen para esa residencial.
async function sembrarTiposIncidenciaDefecto(db, residencialId, transaction) {
  const existentes = await db.TiposIncidencia.findAll({
    where: { residencial_id: residencialId },
    attributes: ['nombre'],
    transaction,
  });
  const nombresExistentes = new Set(existentes.map((t) => t.nombre));
  const faltantes = CATALOGO_TIPOS_INCIDENCIA_DEFECTO.filter((t) => !nombresExistentes.has(t.nombre));
  if (!faltantes.length) return [];
  return db.TiposIncidencia.bulkCreate(
    faltantes.map((t) => ({ residencial_id: residencialId, nombre: t.nombre, nivel_urgencia: t.nivel_urgencia, activo: true })),
    { transaction },
  );
}

module.exports = { CATALOGO_TIPOS_INCIDENCIA_DEFECTO, sembrarTiposIncidenciaDefecto };
