'use strict';

const nodemailer = require('nodemailer');

// Requisito 19: enviar invitaciones por WhatsApp o correo.
//
// Correo: si hay SMTP configurado en .env, manda de verdad. Si no,
// simula el envio (lo deja en consola) para poder probar el flujo sin
// credenciales reales.
//
// WhatsApp: no existe una libreria gratuita que mande mensajes reales
// sin una cuenta de un proveedor (Twilio, Meta Cloud API, etc.), asi
// que esta funcion deja la integracion lista para conectar uno (ver
// README) y mientras tanto simula el envio + devuelve un link de
// wa.me como alternativa manual (el guardia/residente lo puede abrir
// y mandar el mensaje el mismo con un clic).

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    transporter = {
      sendMail: async (opts) => {
        console.log('[envioService] SMTP no configurado, correo simulado:', opts);
        return { simulated: true };
      },
    };
  }
  return transporter;
}

async function enviarCorreo({ para, asunto, texto }) {
  const t = getTransporter();
  return t.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@vigia.local',
    to: para,
    subject: asunto,
    text: texto,
  });
}

async function enviarWhatsapp({ telefono, mensaje }) {
  const link = `https://wa.me/${String(telefono).replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;

  if (process.env.WHATSAPP_PROVIDER === 'twilio' && process.env.TWILIO_SID) {
    // Punto de extension: aca va la llamada real al SDK de Twilio
    // (npm install twilio) usando TWILIO_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM.
    // No se implementa en este entregable porque requiere una cuenta y
    // numero de WhatsApp Business real para poder probarse.
    console.log('[envioService] Proveedor Twilio configurado pero no implementado todavia. Link manual:', link);
    return { simulated: true, link };
  }

  console.log('[envioService] Sin proveedor de WhatsApp configurado, mensaje simulado:', { telefono, mensaje, link });
  return { simulated: true, link };
}

module.exports = { enviarCorreo, enviarWhatsapp };
