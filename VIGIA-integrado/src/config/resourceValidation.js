'use strict';

// Reglas de validacion de campos, por tabla -- la contraparte real (del
// lado del servidor) de las mascaras que ya existen en el frontend
// (formatTelefonoHN, formatDocumentoHN, etc.).
//
// Por que este archivo existe aparte, y no adentro de cada modelo:
// src/models/*.js se regenera por completo cada vez que se corre
// `npm run generate:models` a partir de database/vigia_schema.sql --
// cualquier "validate:{}" que se escribiera a mano ahi adentro se
// perderia en la siguiente regeneracion. Este archivo, igual que
// src/config/resourcePermissions.js, vive aparte a proposito para
// sobrevivir eso.
//
// Antes de este archivo, NINGUNO de los 49 modelos tenia validacion de
// verdad del lado del servidor -- todo lo que el frontend no dejara
// escribir (letras en un telefono, un numero de mas, etc.) igual podia
// mandarse directo a la API (con curl, Postman, o cambiando el HTML),
// sin que el backend lo rechazara.

// ---- Validadores basicos reutilizables ----

const RE_LETRAS = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ][A-Za-zÀ-ÖØ-öø-ÿÑñ'.\- ]*$/; // nombres: letras, acentos, espacios, apostrofe, guion, punto (para "Jr.")
const RE_TELEFONO_HN = /^[23789]\d{3}-?\d{4}$/; // 8 digitos, con o sin guion; el primero debe existir en el plan de numeracion real de Honduras (2=fijo, 3/8/9=celular, 7=algunos VoIP/rurales)
const RE_DOCUMENTO = /^[A-Za-z0-9][A-Za-z0-9 .\-]*$/; // identidad hondurena (solo digitos) o pasaporte/otro (alfanumerico)
const RE_PLACA = /^[A-Za-z0-9][A-Za-z0-9 \-]*$/; // placas de vehiculo, formato variable entre paises

function checarLongitud(valor, min, max) {
  const len = String(valor).trim().length;
  if (min != null && len < min) return `debe tener al menos ${min} caracteres`;
  if (max != null && len > max) return `no puede tener mas de ${max} caracteres`;
  return null;
}

function checarPatron(valor, regex, mensaje) {
  return regex.test(String(valor).trim()) ? null : mensaje;
}

function checarEntero(valor, min, max) {
  const n = Number(valor);
  if (!Number.isInteger(n)) return 'debe ser un numero entero';
  if (min != null && n < min) return `debe ser ${min} o mayor`;
  if (max != null && n > max) return `no puede ser mayor que ${max}`;
  return null;
}

// ---- Reglas por tabla ----
//
// Cada campo puede tener: tipo ('letras'|'telefono'|'documento'|'placa'
// |'texto'|'entero'), min/max (longitud para texto, rango para entero).
// Los campos que no aparecen aqui no se validan (siguen como estaban).
// Si el campo no viene en la peticion, o viene null/vacio, no se valida
// aqui -- eso ya lo decide "allowNull" en el esquema SQL/modelo; esta
// capa solo revisa la FORMA del dato cuando SI viene con contenido.

const REGLAS = {
  usuarios: {
    // Antes el tope era 100 -- tecnicamente ya bloqueaba numeros y
    // simbolos (RE_LETRAS), pero dejaba escribir practicamente un
    // parrafo como "nombre": paso de verdad que alguien termino con un
    // perfil como "Ronaldo Anael Alfaro Hernandez Alfaro Hernandez"
    // (parte del apellido repetida dentro del campo nombre) porque
    // nada se lo impidio. 30 sigue alcanzando para nombres compuestos
    // reales ("María Fernanda", "José Ramón") sin dejar pasar eso.
    nombre: { tipo: 'letras', min: 2, max: 30 },
    apellido: { tipo: 'letras', min: 2, max: 30 },
    telefono: { tipo: 'telefono' },
  },
  residentes: {
    contacto_emergencia_nombre: { tipo: 'letras', min: 2, max: 150 },
    contacto_emergencia_telefono: { tipo: 'telefono' },
  },
  vehiculos: {
    placa: { tipo: 'placa', min: 4, max: 20 },
    marca: { tipo: 'texto', max: 60 },
    modelo: { tipo: 'texto', max: 60 },
    color: { tipo: 'letras', max: 40 },
  },
  personas_autorizadas: {
    nombre_completo: { tipo: 'letras', min: 2, max: 180 },
    numero_documento: { tipo: 'documento', max: 50 },
    telefono: { tipo: 'telefono' },
    placa_vehiculo: { tipo: 'placa', max: 20 },
    empresa: { tipo: 'texto', max: 120 },
    max_accesos_dia: { tipo: 'entero', min: 1, max: 50 },
  },
  contactos_emergencia: {
    nombre: { tipo: 'texto', min: 2, max: 150 },
    telefono: { tipo: 'telefono' },
    telefono_alterno: { tipo: 'telefono' },
  },
  vetos_acceso: {
    nombre_persona: { tipo: 'letras', min: 2, max: 180 },
    numero_documento: { tipo: 'documento', max: 50 },
    telefono: { tipo: 'telefono' },
    motivo: { tipo: 'texto', min: 3, max: 255 },
  },
  invitaciones: {
    nombre_evento: { tipo: 'texto', min: 2, max: 150 },
    max_usos: { tipo: 'entero', min: 1, max: 1000 },
    notas: { tipo: 'texto', max: 255 },
  },
  incidencias: {
    // titulo/descripcion ya se validan a mano en
    // src/routes/overrides/incidencias.js (con sus propios limites de
    // 150/500 caracteres) -- se deja el mismo tope aqui para no dar un
    // segundo mensaje de error contradictorio si algun dia se llama
    // esta validacion generica tambien sobre esos dos campos.
    titulo: { tipo: 'texto', min: 3, max: 150 },
    descripcion: { tipo: 'texto', min: 3, max: 500 },
    ubicacion: { tipo: 'texto', max: 255 },
    guardia_original_nombre: { tipo: 'letras', max: 180 },
  },
  visitantes_frecuentes: {
    alias: { tipo: 'texto', max: 100 },
  },
  paquetes: {
    empresa_envio: { tipo: 'texto', max: 100 },
    descripcion: { tipo: 'texto', max: 255 },
  },
  llegadas_seguras: {
    ubicacion_origen: { tipo: 'texto', max: 255 },
    contacto_confirmacion: { tipo: 'texto', max: 150 },
  },
};

function validarCampo(nombreCampo, valor, regla) {
  if (regla.tipo === 'letras') {
    return checarPatron(valor, RE_LETRAS, `"${nombreCampo}" solo puede tener letras, espacios y acentos`)
      || checarLongitud(valor, regla.min, regla.max);
  }
  if (regla.tipo === 'telefono') {
    return checarPatron(valor, RE_TELEFONO_HN, `"${nombreCampo}" debe ser un telefono valido de 8 digitos`);
  }
  if (regla.tipo === 'documento') {
    return checarPatron(valor, RE_DOCUMENTO, `"${nombreCampo}" tiene caracteres no validos`)
      || checarLongitud(valor, regla.min, regla.max);
  }
  if (regla.tipo === 'placa') {
    return checarPatron(valor, RE_PLACA, `"${nombreCampo}" tiene caracteres no validos para una placa`)
      || checarLongitud(valor, regla.min, regla.max);
  }
  if (regla.tipo === 'entero') {
    return checarEntero(valor, regla.min, regla.max);
  }
  // 'texto': solo longitud, cualquier caracter permitido (motivos,
  // descripciones, nombres de eventos que pueden traer numeros, etc.)
  return checarLongitud(valor, regla.min, regla.max);
}

// Revisa un objeto de datos (el body de un POST/PUT/PATCH) contra las
// reglas de la tabla del modelo dado. Devuelve un arreglo de mensajes de
// error en espanol listo para mostrar; vacio si todo pasa.
function validarCampos(model, body) {
  if (!body) return [];
  const tabla = model.getTableName();
  const reglas = REGLAS[tabla];
  if (!reglas) return [];

  const errores = [];
  Object.keys(reglas).forEach((campo) => {
    if (!(campo in body)) return;
    const valor = body[campo];
    if (valor === null || valor === undefined || valor === '') return;
    const error = validarCampo(campo, valor, reglas[campo]);
    if (error) errores.push(error);
  });
  return errores;
}

module.exports = { validarCampos, REGLAS };
