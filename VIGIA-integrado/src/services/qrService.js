'use strict';

const { randomUUID } = require('crypto');
const QRCode = require('qrcode');

// Requisito 3/18: cada invitacion tiene un codigo QR unico. El codigo en
// si es un UUID (lo que ya espera la columna codigo_qr CHAR(36) del
// esquema); generarImagenDataUrl() lo convierte en una imagen PNG en
// base64 lista para mostrar en el frontend (<img src="...">) o mandar
// por correo/WhatsApp sin necesitar guardar un archivo aparte.

function generarCodigo() {
  return randomUUID();
}

async function generarImagenDataUrl(codigo) {
  return QRCode.toDataURL(codigo, { errorCorrectionLevel: 'M', margin: 1 });
}

module.exports = { generarCodigo, generarImagenDataUrl };
