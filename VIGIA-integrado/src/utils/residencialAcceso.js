'use strict';

// Suspender una residencial COMPLETA por falta de pago -- sin borrar
// nada. El superadmin ya podia marcar una suscripcion (tabla
// "suscripciones") como 'suspendida'/'vencida'/'cancelada' desde
// /suscripciones.html (boton "Suspender", que ya existia), pero eso no
// le bloqueaba nada de verdad a nadie: admin, guardia y residentes de
// esa residencial seguian entrando sin ningun problema. Este archivo es
// el pedazo que faltaba -- lo que de verdad corta el acceso.
//
// Por que a nivel de residencial y no solo por usuario: ya existe
// "usuarios.estado" para suspender UNA cuenta a la vez (ver
// authController.js), pero aqui se necesita apagar TODAS las cuentas de
// una residencial de un solo golpe (admin, guardia, residentes) sin
// tener que ir cuenta por cuenta -- y sin tocar esa columna, para poder
// reactivar todo de vuelta con un solo cambio cuando se pague.
//
// Por que se usa "suscripciones.estado" y no "residenciales.activo":
// residenciales.activo ya significa otra cosa en el sistema (borrado
// logico real, usado si algun dia se elimina una residencial de
// verdad). Mezclar ambos conceptos en el mismo campo haria que
// "eliminar" y "suspender por falta de pago" fueran indistinguibles.
//
// FAIL-OPEN si la residencial no tiene NINGUNA fila en "suscripciones":
// no se bloquea. Esto es a proposito -- residenciales creadas antes de
// que existiera este sistema de suscripciones (datos de siembra,
// residenciales de prueba del equipo, etc.) nunca tuvieron esa fila, y
// tratarlas como "sin acceso" por default hubiera dejado a todo el
// equipo fuera de su propio ambiente de pruebas en cuanto esto se
// desplegara. Solo se bloquea cuando existe una fila de suscripcion Y
// la MAS RECIENTE de esa residencial esta en un estado de corte
// ('suspendida', 'vencida', 'cancelada') -- que es exactamente lo que
// pasa cuando el superadmin usa el boton "Suspender" que ya existia.
//
// Cache de 60s (mismo criterio que ya usa requirePermission() en este
// mismo proyecto para el mapa de permisos): evita una consulta extra a
// la base en cada request autenticado. Efecto practico: al suspender
// una residencial, el corte de acceso tarda hasta ~60s en sentirse
// para alguien que ya tenia una pestaña abierta -- un login NUEVO
// durante esa misma ventana tambien podria alcanzar a pasar. Es el
// mismo margen que ya se acepta hoy para cambios de permisos.

function getDb() {
  return require('../models');
}

const ESTADOS_BLOQUEADOS = ['suspendida', 'vencida', 'cancelada'];

const cache = { estadoPorResidencial: null, loadedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

// Devuelve un Map<residencial_id (string), estado_mas_reciente>. Carga
// TODAS las filas ordenadas por fecha_creacion descendente y se queda
// con la primera que ve por cada residencial_id -- evita depender de
// una funcion de ventana SQL solo para "la ultima fila por grupo", y la
// tabla es chica (una residencial acumula unas pocas filas en meses).
async function cargarEstadoMasRecientePorResidencial() {
  const db = getDb();
  const filas = await db.Suscripciones.findAll({
    attributes: ['residencial_id', 'estado', 'fecha_creacion'],
    order: [['fecha_creacion', 'DESC']],
  });
  const masReciente = new Map();
  filas.forEach((f) => {
    const id = String(f.residencial_id);
    if (!masReciente.has(id)) masReciente.set(id, f.estado);
  });
  return masReciente;
}

// residencialId puede venir null (superadmin, o cuentas legado sin
// residencial) -- esas siempre tienen acceso, esta funcion solo aplica
// a cuentas que SI pertenecen a una residencial.
async function residencialTieneAccesoVigente(residencialId) {
  if (residencialId == null) return true;

  const ahora = Date.now();
  if (!cache.estadoPorResidencial || ahora - cache.loadedAt >= CACHE_TTL_MS) {
    cache.estadoPorResidencial = await cargarEstadoMasRecientePorResidencial();
    cache.loadedAt = ahora;
  }

  const estado = cache.estadoPorResidencial.get(String(residencialId));
  if (estado == null) return true; // sin ninguna suscripcion registrada -- fail-open, ver nota arriba
  return !ESTADOS_BLOQUEADOS.includes(estado);
}

module.exports = {
  residencialTieneAccesoVigente,
  _invalidateCache: () => { cache.estadoPorResidencial = null; },
};
