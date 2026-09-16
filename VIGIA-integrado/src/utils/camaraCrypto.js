'use strict';

// Cifrado reversible para la contrasena de conexion de una camara
// (camaras.clave_stream_cifrada).
//
// Por que esto NO puede ser bcrypt (como usuarios.password_hash o
// respuesta_seguridad_hash): un hash de una sola via sirve para
// COMPARAR ("es esta la contrasena correcta?"), pero una camara no se
// "compara" -- en algun momento el sistema necesita la contrasena EN
// TEXTO PLANO de vuelta para poder construir la URL de conexion real
// hacia la camara/NVR del cliente. Por eso esto usa AES-256-GCM, que
// SI se puede revertir con la misma llave.
//
// La llave sale de CAMARA_CIFRADO_KEY (variable de entorno). Si no esta
// configurada, se deriva una de JWT_SECRET para que el sistema funcione
// igual en desarrollo/demo sin configuracion adicional -- pero en
// produccion de verdad se recomienda poner una llave propia y separada
// (si el dia de mañana JWT_SECRET rota por cualquier motivo, no se
// quiere perder tambien el acceso a todas las contrasenas de camaras
// guardadas).

const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';

function obtenerLlave() {
  const fuente = process.env.CAMARA_CIFRADO_KEY || process.env.JWT_SECRET || 'vigia-camaras-dev';
  if (!process.env.CAMARA_CIFRADO_KEY) {
    // Aviso una sola vez por proceso, no en cada llamada.
    if (!obtenerLlave._avisado) {
      console.warn('[VIGIA] CAMARA_CIFRADO_KEY no esta configurada -- usando una llave derivada de JWT_SECRET. Para produccion, define CAMARA_CIFRADO_KEY aparte en las variables de entorno de Railway.');
      obtenerLlave._avisado = true;
    }
  }
  return crypto.createHash('sha256').update(String(fuente)).digest();
}

// Formato guardado: "iv:tag:datosCifrados", todo en hex, para que quepa
// en una sola columna VARCHAR sin inventar un formato binario propio.
function cifrar(textoPlano) {
  if (textoPlano === null || textoPlano === undefined || textoPlano === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, obtenerLlave(), iv);
  const cifrado = Buffer.concat([cipher.update(String(textoPlano), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${cifrado.toString('hex')}`;
}

function descifrar(valorGuardado) {
  if (!valorGuardado) return null;
  const partes = String(valorGuardado).split(':');
  if (partes.length !== 3) return null;
  try {
    const [ivHex, tagHex, datosHex] = partes;
    const decipher = crypto.createDecipheriv(ALGORITMO, obtenerLlave(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const original = Buffer.concat([decipher.update(Buffer.from(datosHex, 'hex')), decipher.final()]);
    return original.toString('utf8');
  } catch (err) {
    // Llave rotada, dato corrupto, etc. -- nunca tirar la conexion completa
    // de la camara por esto, simplemente se pierde esa contrasena guardada.
    return null;
  }
}

module.exports = { cifrar, descifrar };
