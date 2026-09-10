'use strict';

const express = require('express');
const { login, register, me, logout, sessions, revokeSession, forgotPassword, resetPassword, verificarCorreo, reenviarVerificacion } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/verificar-correo', verificarCorreo);
router.post('/reenviar-verificacion', reenviarVerificacion);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.get('/sessions', requireAuth, sessions);
router.patch('/sessions/:id/revoke', requireAuth, revokeSession);

module.exports = router;
