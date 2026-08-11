'use strict';

const db = require('../../models');
const { Op } = require('sequelize');

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function evaluateMessage(value) {
  const text = normalizeText(value);
  const lines = text ? text.split('\n') : [];
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (!text) return { allowed: false, error: 'Escribe un mensaje.' };
  if (text.length > 500) return { allowed: false, error: 'El mensaje no puede superar 500 caracteres.' };
  if (lines.length > 4) return { allowed: false, error: 'Usa como máximo 4 líneas por mensaje.' };
  if (links > 2) return { allowed: false, error: 'Usa como máximo 2 enlaces por mensaje.' };
  if (/(.)\1{10,}/i.test(text)) return { allowed: false, error: 'Reduce los caracteres repetidos antes de enviar.' };

  let estado = 'permitido';
  let categoria = 'normal';
  let puntaje = 0;
  let detalle = 'Revisión automática con reglas locales.';
  if (/\b(emergencia|auxilio|ambulancia|incendio|intruso)\b/i.test(text)) {
    estado = 'advertencia';
    categoria = 'posible_emergencia';
    puntaje = 85;
    detalle = 'El mensaje contiene términos de emergencia; se resaltará al personal.';
  } else if (text === text.toUpperCase() && text.length >= 35) {
    estado = 'advertencia';
    categoria = 'mayusculas';
    puntaje = 35;
    detalle = 'Mensaje extenso en mayúsculas; permitido con advertencia.';
  }
  return { allowed: true, text, estado, categoria, puntaje, detalle };
}

async function participantConversationIds(userId) {
  const rows = await db.ConversacionesParticipantes.findAll({ where: { usuario_id: userId } });
  return rows.map((row) => row.conversacion_id);
}

async function assertCanUseConversation(conversationId, user) {
  const conversation = await db.Conversaciones.findByPk(conversationId);
  if (!conversation) return null;
  if (user.rol_codigo !== 'superadmin' && String(conversation.residencial_id) !== String(user.residencial_id)) return null;
  if (['admin', 'guardia', 'superadmin'].includes(user.rol_codigo)) return conversation;
  const participant = await db.ConversacionesParticipantes.findOne({
    where: { conversacion_id: conversationId, usuario_id: user.id },
  });
  return participant ? conversation : null;
}

async function currentStaffUser(residencialId) {
  const shift = await db.TurnosGuardia.findOne({
    where: { residencial_id: residencialId, estado: { [Op.in]: ['activo', 'relevado'] } },
    order: [['inicio_programado', 'DESC']],
  });
  if (shift) {
    const id = shift.guardia_relevo_id || shift.guardia_original_id;
    const guard = await db.Usuarios.findOne({ where: { id, estado: 'activo' } });
    if (guard) return guard;
  }

  const guardRole = await db.Roles.findOne({ where: { codigo: 'guardia' } });
  if (guardRole) {
    const guard = await db.Usuarios.findOne({
      where: { residencial_id: residencialId, rol_id: guardRole.id, estado: 'activo' },
      order: [['ultimo_acceso', 'DESC'], ['id', 'ASC']],
    });
    if (guard) return guard;
  }

  const adminRole = await db.Roles.findOne({ where: { codigo: 'admin' } });
  return adminRole ? db.Usuarios.findOne({
    where: { residencial_id: residencialId, rol_id: adminRole.id, estado: 'activo' },
    order: [['ultimo_acceso', 'DESC'], ['id', 'ASC']],
  }) : null;
}

async function ensureResidentConversation(user) {
  if (!user.residencial_id) throw Object.assign(new Error('Tu cuenta no tiene una residencial asignada.'), { status: 400 });
  const staff = await currentStaffUser(user.residencial_id);
  if (!staff) throw Object.assign(new Error('No hay un guardia o administrador activo para iniciar el chat.'), { status: 409 });

  // El residente conserva UN solo hilo continuo con seguridad, sin
  // importar que guardia este de turno. Si cambia el guardia, se le
  // suma como participante de esa misma conversacion en vez de abrir
  // una nueva, para que el historial nunca desaparezca de la vista del
  // residente.
  const ownIds = await participantConversationIds(user.id);
  if (ownIds.length) {
    const existing = await db.Conversaciones.findOne({
      where: { id: { [Op.in]: ownIds }, residencial_id: user.residencial_id, tipo: 'directa' },
      order: [['id', 'DESC']],
    });
    if (existing) {
      const alreadyIn = await db.ConversacionesParticipantes.findOne({
        where: { conversacion_id: existing.id, usuario_id: staff.id },
      });
      if (!alreadyIn) {
        await db.ConversacionesParticipantes.create({ conversacion_id: existing.id, usuario_id: staff.id });
      }
      return { conversation: existing, staff };
    }
  }

  return db.sequelize.transaction(async (transaction) => {
    const conversation = await db.Conversaciones.create({
      residencial_id: user.residencial_id,
      tipo: 'directa',
      nombre: `Atención de ${user.nombre || 'residente'}`.slice(0, 150),
    }, { transaction });
    await db.ConversacionesParticipantes.bulkCreate([
      { conversacion_id: conversation.id, usuario_id: user.id },
      { conversacion_id: conversation.id, usuario_id: staff.id },
    ], { transaction });
    return { conversation, staff };
  });
}

async function participantNames(conversationId) {
  const links = await db.ConversacionesParticipantes.findAll({
    where: { conversacion_id: conversationId },
    order: [['fecha_union', 'ASC']],
  });
  const ids = links.map((x) => x.usuario_id);
  if (!ids.length) return [];
  const users = await db.Usuarios.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'nombre', 'apellido', 'foto_url', 'rol_id'],
  });
  const roleIds = [...new Set(users.map((x) => x.rol_id))];
  const roles = roleIds.length ? await db.Roles.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['id', 'codigo'] }) : [];
  const roleMap = new Map(roles.map((r) => [String(r.id), r.codigo]));
  // Se conserva el orden de ingreso (fecha_union) para que el residente
  // que inicio la conversacion siempre quede identificable, aunque con
  // el tiempo se sumen varios guardias al mismo hilo por cambios de turno.
  return ids
    .map((id) => users.find((u) => String(u.id) === String(id)))
    .filter(Boolean)
    .map((x) => ({
      id: x.id,
      nombre_completo: `${x.nombre} ${x.apellido}`.trim(),
      foto_url: x.foto_url,
      rol_codigo: roleMap.get(String(x.rol_id)) || null,
    }));
}

async function markConversationRead(conversationId, readerId) {
  await db.Mensajes.update(
    { leido: true },
    { where: { conversacion_id: conversationId, usuario_id: { [Op.ne]: readerId }, leido: false } },
  );
}

async function messagesForConversation(conversationId) {
  const rows = await db.Mensajes.findAll({
    where: { conversacion_id: conversationId },
    order: [['fecha_hora', 'ASC']],
    limit: 300,
  });
  const ids = [...new Set(rows.map((x) => x.usuario_id))];
  const users = ids.length ? await db.Usuarios.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'nombre', 'apellido'],
  }) : [];
  const userMap = new Map(users.map((x) => [String(x.id), `${x.nombre} ${x.apellido}`.trim()]));
  return rows.map((row) => ({ ...row.toJSON(), autor_nombre: userMap.get(String(row.usuario_id)) || 'Usuario' }));
}

module.exports = function mensajesOverride({ router, model, handlers, pkPath }) {
  router.get('/hilo-principal', async (req, res, next) => {
    try {
      let conversation;
      let staff = null;
      if (req.user.rol_codigo === 'residente') {
        const result = await ensureResidentConversation(req.user);
        conversation = result.conversation;
        staff = result.staff;
      } else {
        const ids = await participantConversationIds(req.user.id);
        conversation = ids.length ? await db.Conversaciones.findOne({
          where: { id: { [Op.in]: ids }, residencial_id: req.user.residencial_id },
          order: [['id', 'DESC']],
        }) : null;
      }
      if (!conversation) return res.json({ data: { conversacion: null, participantes: [], mensajes: [] } });
      await markConversationRead(conversation.id, req.user.id);
      const [participants, messages] = await Promise.all([
        participantNames(conversation.id),
        messagesForConversation(conversation.id),
      ]);
      res.json({ data: { conversacion: conversation, participantes: participants, mensajes: messages, personal_actual: staff ? { id: staff.id, nombre_completo: `${staff.nombre} ${staff.apellido}`.trim() } : null } });
    } catch (err) { next(err); }
  });

  router.get('/inbox', async (req, res, next) => {
    try {
      if (!['guardia', 'admin', 'superadmin'].includes(req.user.rol_codigo)) return res.status(403).json({ error: 'Solo el personal puede consultar la bandeja.' });
      const residencialId = req.user.residencial_id || req.query.residencial_id;
      if (!residencialId) return res.status(400).json({ error: 'Selecciona una residencial.' });
      const conversations = await db.Conversaciones.findAll({
        where: { residencial_id: residencialId },
        order: [['id', 'DESC']],
        limit: 100,
      });
      const data = [];
      for (const conversation of conversations) {
        const participants = await participantNames(conversation.id);
        const last = await model.findOne({ where: { conversacion_id: conversation.id }, order: [['fecha_hora', 'DESC']] });
        data.push({
          ...conversation.toJSON(),
          participantes: participants,
          ultimo_mensaje: last ? last.contenido : null,
          ultima_fecha: last ? last.fecha_hora : conversation.fecha_creacion,
        });
      }
      res.json({ data });
    } catch (err) { next(err); }
  });

  router.get('/conversacion/:id', async (req, res, next) => {
    try {
      const conversation = await assertCanUseConversation(req.params.id, req.user);
      if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });
      await markConversationRead(conversation.id, req.user.id);
      const [participants, messages] = await Promise.all([
        participantNames(conversation.id),
        messagesForConversation(conversation.id),
      ]);
      res.json({ data: { conversacion: conversation, participantes: participants, mensajes: messages } });
    } catch (err) { next(err); }
  });

  router.post('/enviar', async (req, res, next) => {
    const check = evaluateMessage(req.body && req.body.contenido);
    if (!check.allowed) return res.status(400).json({ error: check.error });
    try {
      let conversation;
      if (req.body.conversacion_id) {
        conversation = await assertCanUseConversation(req.body.conversacion_id, req.user);
        if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });
      } else if (req.user.rol_codigo === 'residente') {
        conversation = (await ensureResidentConversation(req.user)).conversation;
      } else {
        return res.status(400).json({ error: 'Selecciona una conversación.' });
      }

      const message = await db.sequelize.transaction(async (transaction) => {
        const created = await model.create({
          conversacion_id: conversation.id,
          usuario_id: req.user.id,
          contenido: check.text,
          tipo_contenido: 'texto',
          leido: false,
        }, { transaction });
        await db.ModeracionMensajes.create({
          mensaje_id: created.id,
          motor: 'reglas_locales',
          estado: check.estado,
          categoria: check.categoria,
          puntaje: check.puntaje,
          detalle: check.detalle,
        }, { transaction });
        return created;
      });
      res.status(201).json({ data: message, moderacion: { estado: check.estado, categoria: check.categoria, detalle: check.detalle } });
    } catch (err) { next(err); }
  });

  // Mantiene lectura individual para compatibilidad, pero bloquea la
  // creación genérica para que nadie omita participantes o moderación.
  router.get('/', handlers.list);
  router.post('/', (req, res) => res.status(405).json({ error: 'Usa /api/mensajes/enviar.' }));
  router.get(`/${pkPath}`, handlers.getOne);
  router.put(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los mensajes no se editan.' }));
  router.patch(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los mensajes no se editan.' }));
  router.delete(`/${pkPath}`, (req, res) => res.status(405).json({ error: 'Los mensajes se conservan para trazabilidad.' }));
};

module.exports.evaluateMessage = evaluateMessage;
