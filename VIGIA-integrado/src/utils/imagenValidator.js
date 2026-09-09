'use strict';

// Confirma que un data URL de imagen (lo que mandan los campos
// evidencia_url/foto_url desde el navegador) sea de verdad una imagen,
// revisando los primeros bytes reales del archivo -- no el nombre, no
// la extension, no el "image/png" que el propio data URL dice ser.
//
// Por que hace falta esto: se reporto que un archivo (un PDF) renombrado
// con extension .png se pudo subir como si fuera una foto real. El
// navegador SI suele rechazar decodificar un PDF disfrazado de imagen
// (ver public/js/{autorizados,vetos,incidencias,control-acceso}.js, que
// ya reintentan y avisan si eso pasa) -- pero nada en el backend
// revisaba esto: quien mandara la peticion directo a la API (sin pasar
// por el navegador, ej. con curl o Postman modificado) podia guardar
// CUALQUIER contenido en un campo pensado solo para fotos, sin que el
// servidor lo notara. El unico chequeo que existia (incidencias.js) era
// de TAMAÑO, no de contenido.

// Firma de bytes (numeros magicos) real de cada formato que la app
// acepta -- independientes de lo que el data URL diga ser.
const FIRMAS = [
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8"
];

const RE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BYTES_DECODIFICADOS = 2 * 1024 * 1024; // 2 MB reales, no el tamaño del texto base64

function validarImagenBase64(dataUrl) {
  const match = RE_DATA_URL.exec(String(dataUrl || '').trim());
  if (!match) return { ok: false, error: 'La evidencia debe ser una imagen (PNG, JPG o GIF) en formato valido.' };

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch (e) {
    return { ok: false, error: 'No se pudo leer el archivo de evidencia.' };
  }

  if (buffer.length > MAX_BYTES_DECODIFICADOS) {
    return { ok: false, error: 'La imagen es demasiado grande (máximo 2 MB).' };
  }

  // WEBP no tiene una firma de tamaño fijo simple al inicio (es
  // "RIFF"+4 bytes de tamaño+"WEBP"), se revisa aparte.
  const esWebp = buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP';
  if (esWebp) return { ok: true };

  const coincide = FIRMAS.some(({ bytes }) =>
    buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)
  );
  if (!coincide) {
    return { ok: false, error: 'El archivo no es una imagen valida (el contenido no coincide con ningun formato de imagen conocido).' };
  }
  return { ok: true };
}

module.exports = { validarImagenBase64 };
