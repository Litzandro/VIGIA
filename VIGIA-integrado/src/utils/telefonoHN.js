'use strict';

// Normaliza cualquier telefono que llegue del frontend a un formato unico
// y consistente: "+504" seguido de los 8 digitos locales (ej. "+50499990000").
//
// Por que esto vive en el backend y no alcanza con el "+504" visual que ya
// puso Hilary en el formulario (public/js/common.js, attachPhoneCountryCode):
// ese prefijo es SOLO visual -- el input le sigue mandando al backend
// nomas los 8 digitos locales, sin el codigo de pais. Si el backend
// guarda eso tal cual, dos cosas fallan silenciosamente:
//   1) El enlace de WhatsApp de una invitacion se arma como
//      "wa.me/99990000" (src/services/envioService.js) -- un numero de
//      8 digitos sin codigo de pais no es un contacto valido de WhatsApp,
//      el enlace no abre ningun chat real.
//   2) Cualquier consulta o reporte futuro que cruce telefonos (ej. con
//      un provider externo de SMS) no puede confiar en el formato.
//
// Se guarda el codigo de pais PEGADO al numero (no en una columna aparte)
// porque las columnas "telefono" de este proyecto son VARCHAR(30) de
// proposito general (visitantes, contactos de emergencia, personas
// autorizadas...) y VIGIA solo opera en Honduras hoy -- agregar una
// columna "codigo_pais" en 6 tablas distintas para guardar siempre el
// mismo valor fijo hubiera sido mas cambio del que el problema real pide.
function normalizarTelefonoHN(valor) {
  if (valor === null || valor === undefined) return null;
  const soloDigitos = String(valor).replace(/\D/g, '');
  if (!soloDigitos) return null;

  // Si ya viene con el 504 al inicio (con o sin "+", por ejemplo porque
  // el dato ya estaba migrado, o porque un cliente que no es el
  // formulario web -- Postman, una futura app -- ya lo mandó completo),
  // se respeta tal cual en vez de duplicarlo.
  const digitosLocales = (soloDigitos.startsWith('504') && soloDigitos.length > 8)
    ? soloDigitos.slice(3)
    : soloDigitos;

  if (digitosLocales.length !== 8) {
    // No son 8 digitos hondureños validos: se guarda solo lo que llegó
    // (sin inventar un +504 sobre un dato que no cuadra). Es mejor un
    // dato reconociblemente incompleto que uno que aparenta ser válido
    // y no lo es.
    return soloDigitos;
  }
  return `+504${digitosLocales}`;
}

module.exports = { normalizarTelefonoHN };
