-- =====================================================================
-- 10. FIX: incidencias.estado_id sin valor al crear/actualizar
-- Rol: Base de datos -- Ronaldo Alfaro
--
-- Hallazgo: 03_mejoras_bd_visitas_incidencias.sql agrego la columna
-- incidencias.estado_id como NOT NULL y sin DEFAULT, pero el backend
-- (modelo Incidencias.js y src/routes/overrides/incidencias.js) sigue
-- escribiendo solo la columna vieja "estado" (ENUM). Resultado en
-- cualquier base donde ya se corrio el 03:
--   POST /api/incidencias -> 400 "Field 'estado_id' doesn't have a
--   default value"  => NADIE puede reportar incidencias.
-- Y aunque se creara, al cambiar "estado" el estado_id quedaba viejo.
--
-- Ademas, el catalogo estados_incidencia que creo el 03 no incluye
-- 'pendiente_aprobacion' (estado inicial cuando reporta un residente) ni
-- 'rechazada', que si existen en el ENUM de incidencias.estado. Sin esas
-- filas, esas incidencias quedaban con un estado_id que no les
-- corresponde. Se agregan aqui.
--
-- Arreglo sin tocar el backend: triggers que mantienen estado_id
-- sincronizado con "estado" en cada INSERT/UPDATE, mas un DEFAULT de
-- respaldo. Es seguro correrlo mas de una vez.
--
-- Solo aplica si la base YA tiene la columna estado_id (o sea, si se
-- corrio el 03). Si no existe, este script no hace falta.
-- =====================================================================
SET NAMES utf8mb4;

INSERT IGNORE INTO estados_incidencia (codigo, nombre, orden) VALUES
    ('pendiente_aprobacion', 'Pendiente de aprobación', 0),
    ('rechazada',            'Rechazada',               6);

ALTER TABLE incidencias
  MODIFY COLUMN estado_id TINYINT UNSIGNED NOT NULL DEFAULT 1;

-- Re-sincroniza filas que hayan quedado desalineadas
UPDATE incidencias i
JOIN estados_incidencia e ON e.codigo = i.estado
SET i.estado_id = e.id
WHERE i.estado_id <> e.id;

DROP TRIGGER IF EXISTS trg_incidencias_estado_id_ins;
DROP TRIGGER IF EXISTS trg_incidencias_estado_id_upd;

DELIMITER $$
CREATE TRIGGER trg_incidencias_estado_id_ins
BEFORE INSERT ON incidencias
FOR EACH ROW
BEGIN
  DECLARE v_id TINYINT UNSIGNED;
  SELECT id INTO v_id FROM estados_incidencia WHERE codigo = NEW.estado LIMIT 1;
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
    SELECT id INTO v_id FROM estados_incidencia WHERE codigo = NEW.estado LIMIT 1;
    IF v_id IS NOT NULL THEN
      SET NEW.estado_id = v_id;
    END IF;
  END IF;
END$$
DELIMITER ;
