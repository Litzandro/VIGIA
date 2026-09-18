'use strict';

const nodemailer = require('nodemailer');

// Requisito 19: enviar invitaciones por WhatsApp o correo.
//
// Correo: hay dos formas de mandarlo, en este orden de preferencia:
//   1) BREVO_API_KEY configurada -> se manda por la API HTTPS de Brevo
//      (api.brevo.com), NO por SMTP.
//   2) si no, SMTP_HOST configurado -> se manda por SMTP con nodemailer
//      (sirve para correr esto en un servidor que no bloquee el puerto).
//   3) si no hay ninguna, se simula (queda en consola) para poder
//      probar el flujo sin credenciales reales.
//
// Por que existe la opcion 1 ademas de la 2: Railway (donde esta
// desplegado VIGIA) bloquea las conexiones salientes por el puerto SMTP
// (587/465) en su plan gratuito -- confirmado en los logs de produccion,
// nodemailer se quedaba 120 segundos esperando y terminaba con
// "Error: Connection timeout". No es un problema de credenciales ni de
// configuracion: es que ese puerto especifico no sale del contenedor.
// La API de Brevo evita el problema por completo porque viaja por
// HTTPS (puerto 443), el mismo puerto que ya usa cualquier fetch a
// cualquier API -- nunca esta bloqueado.
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

// Manda un correo real usando la API HTTPS de Brevo (nunca SMTP, por
// eso no lo bloquea la red de Railway). Documentacion:
// https://developers.brevo.com/reference/sendtransacemail
async function enviarCorreoBrevo({ para, asunto, texto }) {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: process.env.SMTP_FROM || process.env.BREVO_SENDER || 'no-reply@vigia.local', name: 'VIGIA' },
      to: [{ email: para }],
      subject: asunto,
      textContent: texto,
    }),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    // Se registra el detalle completo en los logs (util para depurar,
    // ej. remitente todavia no verificado en Brevo) pero el error que
    // sube al usuario final se queda generico -- lo maneja el
    // errorHandler de siempre.
    console.error('[envioService] Brevo respondio con error:', respuesta.status, detalle);
    throw new Error('No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
  }
  return respuesta.json();
}

async function enviarCorreo({ para, asunto, texto }) {
  if (process.env.BREVO_API_KEY) {
    return enviarCorreoBrevo({ para, asunto, texto });
  }
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
