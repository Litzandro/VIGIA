'use strict';

const express = require('express');
const { login, register, me, logout, sessions, revokeSession, recuperarPregunta, verificarRespuesta, resetPassword } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const db = require('../models');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/residenciales-publicas', async (req,res,next)=>{
  try{
    const rows=await db.Residenciales.findAll({where:{activo:true},attributes:['id','nombre'],order:[['nombre','ASC']]});
    res.json({data:rows});
  }catch(err){next(err);}
});
router.post('/recuperar-pregunta', recuperarPregunta);
router.post('/verificar-respuesta', verificarRespuesta);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.get('/sessions', requireAuth, sessions);
router.patch('/sessions/:id/revoke', requireAuth, revokeSession);

module.exports = router;
