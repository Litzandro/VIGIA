'use strict';

// Regla única de fortaleza de contraseña, compartida entre el registro
// público (authController) y la creación administrativa de cuentas
// (routes/overrides/usuarios.js), para que ambos caminos exijan lo mismo.
//
// Requisitos: al menos 8 caracteres, una mayúscula, una minúscula y un
// número. No exigimos símbolos especiales para no volver la UX
// demasiado pesada, pero esto se puede endurecer aquí en un solo lugar
// si el proyecto lo necesita más adelante.
function validatePassword(password) {
  const value = String(password || '');

  if (value.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (!/[a-z]/.test(value)) {
    return { ok: false, error: 'La contraseña debe incluir al menos una letra minúscula.' };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, error: 'La contraseña debe incluir al menos una letra mayúscula.' };
  }
  if (!/[0-9]/.test(value)) {
    return { ok: false, error: 'La contraseña debe incluir al menos un número.' };
  }

  return { ok: true };
}

module.exports = { validatePassword };
