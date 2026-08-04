'use strict';

// Requisito 12: generar reportes por fechas, usuarios o tipo de
// incidencia. En vez de reescribir la logica de joins en Sequelize,
// reusa las vistas que ya vienen en vigia_schema.sql
// (vista_historial_accesos, vista_incidencias_abiertas,
// vista_estadisticas_residencial): son la misma fuente de verdad que
// documentacion/vigia_documentacion.docx describe para el dashboard.

const express = require('express');
const db = require('../models');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth, requirePermission('reportes.generar'));

function scopedWhere(req) {
  return req.user.rol_codigo === 'superadmin' ? '1=1' : 'residencial_id = :residencial_id';
}

router.get('/accesos', async (req, res, next) => {
  try {
    const { desde, hasta, usuario } = req.query;
    const replacements = { residencial_id: req.user.residencial_id };
    let sql = `SELECT * FROM vista_historial_accesos WHERE ${scopedWhere(req)}`;

    if (desde) {
      sql += ' AND fecha_hora >= :desde';
      replacements.desde = desde;
    }
    if (hasta) {
      sql += ' AND fecha_hora <= :hasta';
      replacements.hasta = hasta;
    }
    if (usuario) {
      sql += ' AND persona LIKE :usuario';
      replacements.usuario = `%${usuario}%`;
    }
    sql += ' ORDER BY fecha_hora DESC LIMIT 500';

    const [rows] = await db.sequelize.query(sql, { replacements });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/incidencias', async (req, res, next) => {
  try {
    const { tipo, desde, hasta } = req.query;
    const replacements = { residencial_id: req.user.residencial_id };
    let sql = `SELECT * FROM vista_incidencias_abiertas WHERE ${scopedWhere(req)}`;

    if (tipo) {
      sql += ' AND tipo_incidencia = :tipo';
      replacements.tipo = tipo;
    }
    if (desde) {
      sql += ' AND fecha_hora >= :desde';
      replacements.desde = desde;
    }
    if (hasta) {
      sql += ' AND fecha_hora <= :hasta';
      replacements.hasta = hasta;
    }
    sql += ' ORDER BY fecha_hora DESC LIMIT 500';

    const [rows] = await db.sequelize.query(sql, { replacements });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/estadisticas', async (req, res, next) => {
  try {
    const replacements = { residencial_id: req.user.residencial_id };
    const sql = `SELECT * FROM vista_estadisticas_residencial WHERE ${req.user.rol_codigo === 'superadmin' ? '1=1' : 'residencial_id = :residencial_id'}`;
    const [rows] = await db.sequelize.query(sql, { replacements });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
