'use strict';

const express = require('express');
const { login, register, me, logout, sessions, revokeSession, recuperarPregunta, verificarRespuesta, resetPassword } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/recuperar-pregunta', recuperarPregunta);
router.post('/verificar-respuesta', verificarRespuesta);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.get('/sessions', requireAuth, sessions);
router.patch('/sessions/:id/revoke', requireAuth, revokeSession);

module.exports = router;
