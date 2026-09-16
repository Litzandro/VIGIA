'use strict';

// Que funciones (camaras, trancas) estan incluidas en el plan de una
// residencial -- separado a proposito de residencialAcceso.js, que
// resuelve una pregunta distinta ("le cortamos TODO el acceso por
// falta de pago?"). Aqui la pregunta es "aunque pueda entrar, su plan
// incluye esta funcion en particular?" -- las trae de la suscripcion
// MAS RECIENTE de la residencial (mismo criterio que
// residencialAcceso.js: la fila con fecha_creacion mas alta).
//
// FAIL-OPEN igual que residencialAcceso.js: si la residencial no tiene
// ninguna fila de suscripcion (datos de siembra/pruebas de antes de
// que existiera este sistema comercial), se asume que SI incluye todo
// -- no inventamos un bloqueo para datos que nunca definieron un plan.
//
// Cache de 60s para no consultar la base en cada request; se
// invalida sola con el tiempo (mismo criterio ya usado en el proyecto
// para el mapa de permisos y para residencialAcceso.js).

function getDb() {
  return require('../models');
}

const cache = { infoPorResidencial: null, loadedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

const PLAN_COMPLETO_POR_DEFECTO = {
  plan_id: null,
  plan_nombre: null,
  incluye_camaras: true,
  incluye_trancas: true,
  incluye_soporte: true,
  max_viviendas: null,
  max_guardias: null,
  precio_mensual: null,
  precio_acordado: null,
  estado_suscripcion: null,
  fecha_inicio: null,
  proxima_facturacion: null,
  ciclo: null,
};

async function cargarInfoMasRecientePorResidencial() {
  const db = getDb();
  const filas = await db.Suscripciones.findAll({
    attributes: ['residencial_id', 'plan_id', 'estado', 'fecha_inicio', 'proxima_facturacion', 'ciclo', 'precio_acordado', 'fecha_creacion'],
    order: [['fecha_creacion', 'DESC']],
    include: [{
      model: db.PlanesServicio,
      as: 'plan',
      attributes: ['id', 'nombre', 'precio_mensual', 'incluye_camaras', 'incluye_trancas', 'incluye_soporte', 'max_viviendas', 'max_guardias'],
    }],
  });

  const masReciente = new Map();
  filas.forEach((f) => {
    const id = String(f.residencial_id);
    if (masReciente.has(id)) return; // ya viene ordenado DESC, el primero que se ve por id es el mas reciente
    const plan = f.plan || {};
    masReciente.set(id, {
      plan_id: f.plan_id,
      plan_nombre: plan.nombre || null,
      incluye_camaras: Boolean(plan.incluye_camaras),
      incluye_trancas: Boolean(plan.incluye_trancas),
      incluye_soporte: plan.incluye_soporte !== false,
      max_viviendas: plan.max_viviendas != null ? plan.max_viviendas : null,
      max_guardias: plan.max_guardias != null ? plan.max_guardias : null,
      precio_mensual: plan.precio_mensual != null ? plan.precio_mensual : null,
      precio_acordado: f.precio_acordado != null ? f.precio_acordado : null,
      estado_suscripcion: f.estado,
      fecha_inicio: f.fecha_inicio,
      proxima_facturacion: f.proxima_facturacion,
      ciclo: f.ciclo,
    });
  });
  return masReciente;
}

async function obtenerInfoPlan(residencialId) {
  if (residencialId == null) return { ...PLAN_COMPLETO_POR_DEFECTO };

  const ahora = Date.now();
  if (!cache.infoPorResidencial || ahora - cache.loadedAt >= CACHE_TTL_MS) {
    cache.infoPorResidencial = await cargarInfoMasRecientePorResidencial();
    cache.loadedAt = ahora;
  }

  const info = cache.infoPorResidencial.get(String(residencialId));
  return info || { ...PLAN_COMPLETO_POR_DEFECTO };
}

async function residencialIncluyeFuncion(residencialId, campo) {
  const info = await obtenerInfoPlan(residencialId);
  return Boolean(info[campo]);
}

module.exports = {
  obtenerInfoPlan,
  residencialIncluyeFuncion,
  _invalidateCache: () => { cache.infoPorResidencial = null; },
};
