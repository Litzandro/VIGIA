-- =====================================================================
-- 08. FIX: ENUM incompleto en incidencias_seguimiento
--
-- Sintoma reportado: al aprobar o rechazar un reporte de incidencia
-- (pantalla de guardia/admin, "Autorizaciones/Reportes por aprobar"),
-- la app mostraba "Error de base de datos (Data truncated for column
-- 'estado_anterior' at row 1)" y la aprobacion/rechazo no se guardaba.
--
-- Causa: la columna incidencias.estado ya incluye los estados
-- 'pendiente_aprobacion' y 'rechazada' (agregados cuando se hizo el
-- flujo de aprobacion), pero la tabla incidencias_seguimiento -- que
-- guarda el historial de cada cambio de estado -- se quedo con el
-- ENUM viejo, de solo 4 valores. Cualquier aprobacion/rechazo intenta
-- registrar "estado_anterior = pendiente_aprobacion" (o
-- "estado_nuevo = rechazada") en una columna que no reconoce esos
-- valores, y MySQL lo rechaza.
--
-- Este script SOLO amplia el ENUM ya existente (no borra ni mueve
-- ningun dato, ninguna fila actual cambia de valor). Es seguro
-- correrlo aunque ya se haya intentado aprobar/rechazar algo antes y
-- fallara -- esos intentos nunca llegaron a guardarse.
--
-- Como correrlo: pegar este SQL completo en el cliente de MySQL de
-- Railway (o el que usen para administrar la base de datos) y
-- ejecutarlo una sola vez.
-- =====================================================================

ALTER TABLE incidencias_seguimiento
  MODIFY estado_anterior ENUM('pendiente_aprobacion','reportada','en_revision','resuelta','cerrada','rechazada') NULL,
  MODIFY estado_nuevo    ENUM('pendiente_aprobacion','reportada','en_revision','resuelta','cerrada','rechazada') NOT NULL;

-- Verificacion opcional (deberia mostrar los 6 valores en ambas columnas):
-- SHOW COLUMNS FROM incidencias_seguimiento LIKE 'estado_%';
