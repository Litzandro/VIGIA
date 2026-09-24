-- =====================================================================
-- 10. FIX: incidencias.estado_id sin valor al crear/actualizar
-- Rol: Base de datos -- Ronaldo Alfaro (correccion adicional tras
-- aplicarlo en Railway: choque de collation, ver mas abajo)
--
-- Hallazgo: 03_mejoras_bd_visitas_incidencias.sql agrego la columna
-- incidencias.estado_id como NOT NULL y sin DEFAULT, pero el backend
-- (modelo Incidencias.js y src/routes/overrides/incidencias.js) sigue
-- escribiendo solo la columna vieja "estado" (ENUM). Resultado en
-- cualquier base donde ya se corrio el 03:
--   POST /api/incidencias -> 400 "Field 'estado_id' doesn't have a
--   default value"  => NADIE puede reportar incidencias.
--
-- Ademas, el catalogo estados_incidencia que creo el 03 no incluye
-- 'pendiente_aprobacion' (estado inicial cuando reporta un residente) ni
-- 'rechazada', que si existen en el ENUM de incidencias.estado. Sin esas
-- filas, esas incidencias quedaban con un estado_id que no les
-- corresponde (NULL).
--
-- CHOQUE DE COLLATION (encontrado al correr esto en Railway/MySQL 8):
-- la tabla estados_incidencia se crea con la collation por defecto del
-- servidor (utf8mb4_0900_ai_ci en MySQL 8), pero la columna
-- incidencias.estado ya existente puede tener una collation distinta
-- (ej. utf8mb4_unicode_ci, heredada de una version anterior del
-- servidor o de como se creo la base). Comparar directamente
-- "e.codigo = i.estado" entre las dos da:
--   Error 1267: Illegal mix of collations
-- Este script fuerza la comparacion con COLLATE utf8mb4_general_ci
-- (disponible siempre en MySQL 8, aunque ya no sea el default) para que
-- funcione sin importar la collation real de cada tabla.
--
-- Arreglo sin tocar el backend: triggers que mantienen estado_id
-- sincronizado con "estado" en cada INSERT/UPDATE, mas un DEFAULT de
-- respaldo. Es seguro correrlo mas de una vez.
--
-- Solo aplica si la base YA tiene la columna estado_id (o sea, si se
-- corrio el 03). Si no existe, correr primero el 03 completo (este
-- script asume que "ALTER TABLE incidencias ADD COLUMN estado_id" ya se
-- hizo).
-- =====================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- 1) completar el catalogo con los 2 estados que le faltaban
INSERT IGNORE INTO estados_incidencia (codigo, nombre, orden) VALUES
    ('pendiente_aprobacion', 'Pendiente de aprobación', 0),
    ('rechazada',            'Rechazada',               6);

-- 2) rellenar estado_id en cualquier fila que haya quedado sin valor
--    (collation-safe: no importa si estados_incidencia.codigo e
--    incidencias.estado tienen collations distintas)
UPDATE incidencias i
JOIN estados_incidencia e
  ON CONVERT(e.codigo USING utf8mb4) COLLATE utf8mb4_general_ci
   = CONVERT(i.estado USING utf8mb4) COLLATE utf8mb4_general_ci
SET i.estado_id = e.id
WHERE i.estado_id IS NULL;

-- 3) NOT NULL + DEFAULT de respaldo (por si en el futuro se inserta
--    sin pasar por el trigger, ej. una carga masiva)
ALTER TABLE incidencias
  MODIFY COLUMN estado_id TINYINT UNSIGNED NOT NULL DEFAULT 1;

-- 4) triggers que mantienen estado_id sincronizado con estado, siempre
--    (mismo ajuste de collation que el paso 2)
DROP TRIGGER IF EXISTS trg_incidencias_estado_id_ins;
DROP TRIGGER IF EXISTS trg_incidencias_estado_id_upd;

DELIMITER $$
CREATE TRIGGER trg_incidencias_estado_id_ins
BEFORE INSERT ON incidencias
FOR EACH ROW
BEGIN
  DECLARE v_id TINYINT UNSIGNED;
  SELECT id INTO v_id FROM estados_incidencia
    WHERE CONVERT(codigo USING utf8mb4) COLLATE utf8mb4_general_ci
        = CONVERT(NEW.estado USING utf8mb4) COLLATE utf8mb4_general_ci
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    SET NEW.estado_id = v_id;
  END IF;
END$$

CREATE TRIGGER trg_incidencias_estado_id_upd
BEFORE UPDATE ON incidencias
FOR EACH ROW
BEGIN
  DECLARE v_id TINYINT UNSIGNED;
  IF NOT (NEW.estado <=> OLD.estado) THEN
    SELECT id INTO v_id FROM estados_incidencia
      WHERE CONVERT(codigo USING utf8mb4) COLLATE utf8mb4_general_ci
          = CONVERT(NEW.estado USING utf8mb4) COLLATE utf8mb4_general_ci
      LIMIT 1;
    IF v_id IS NOT NULL THEN
      SET NEW.estado_id = v_id;
    END IF;
  END IF;
END$$
DELIMITER ;

-- Verificacion opcional (deberia devolver 0 filas -- ninguna incidencia
-- sin estado_id):
-- SELECT COUNT(*) FROM incidencias WHERE estado_id IS NULL;
