-- =====================================================================
-- 12. Plantillas de turno (recurrentes y rotativos) + historial
--
-- Antes cada jornada de garita era una fila 100% manual e independiente
-- en turnos_guardia: para un turno que se repite todos los dias (o que
-- se cubre entre varios guardias por turnos) habia que volver a llenar
-- "Programar jornada" desde cero cada vez.
--
-- Esta migracion agrega 2 tablas nuevas:
--   - plantillas_turno: el patron ("Garita principal, 6am-2pm, todos los
--     dias"). Con un solo guardia asignado, el turno se repite siempre
--     con esa persona; con varios, se van rotando en el orden que se
--     definio (round-robin).
--   - plantilla_turno_guardias: la lista ordenada de guardias de cada
--     plantilla.
-- Y una columna nueva en turnos_guardia (plantilla_id) para saber de que
-- plantilla salio cada turno generado.
--
-- No hay ningun cron en el servidor -- los turnos de una plantilla activa
-- se generan solos (hoy, y cualquier dia atrasado hasta 7 dias) la
-- proxima vez que alguien abre "Operacion de garita" de esa residencial.
-- Ver sincronizarTurnosDesdePlantillas() en
-- src/routes/overrides/turnosGuardia.js.
--
-- La misma funcion tambien marca como "ausente" cualquier turno
-- programado cuya hora de inicio ya paso hace mas de 30 minutos sin que
-- el guardia pulsara "Iniciar".
--
-- Es seguro correrlo mas de una vez.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS plantillas_turno (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    punto_acceso_id       BIGINT UNSIGNED NULL,
    nombre                VARCHAR(120) NOT NULL,
    hora_inicio           TIME NOT NULL,
    hora_fin              TIME NOT NULL,
    dias_semana           VARCHAR(20) NOT NULL,
    activa                TINYINT(1) NOT NULL DEFAULT 1,
    creado_por            BIGINT UNSIGNED NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_plantilla_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_plantilla_punto FOREIGN KEY (punto_acceso_id) REFERENCES puntos_acceso(id) ON DELETE SET NULL,
    CONSTRAINT fk_plantilla_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plantilla_turno_guardias (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plantilla_id          BIGINT UNSIGNED NOT NULL,
    guardia_id            BIGINT UNSIGNED NOT NULL,
    orden                 TINYINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_ptg_plantilla FOREIGN KEY (plantilla_id) REFERENCES plantillas_turno(id) ON DELETE CASCADE,
    CONSTRAINT fk_ptg_guardia FOREIGN KEY (guardia_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY uq_plantilla_guardia (plantilla_id, guardia_id)
) ENGINE=InnoDB;

-- Indice de apoyo (ignorar el error si ya existe al correr esto dos veces).
SET @idx_existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plantillas_turno' AND INDEX_NAME = 'idx_plantilla_activa'
);
SET @sql := IF(@idx_existe = 0, 'CREATE INDEX idx_plantilla_activa ON plantillas_turno(residencial_id, activa)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Columna nueva en turnos_guardia (con guarda para poder correr esto mas de una vez).
SET @col_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'turnos_guardia' AND COLUMN_NAME = 'plantilla_id'
);
SET @sql := IF(@col_existe = 0,
  'ALTER TABLE turnos_guardia ADD COLUMN plantilla_id BIGINT UNSIGNED NULL AFTER punto_acceso_id, ADD CONSTRAINT fk_turno_plantilla FOREIGN KEY (plantilla_id) REFERENCES plantillas_turno(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx2_existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'turnos_guardia' AND INDEX_NAME = 'idx_turno_plantilla'
);
SET @sql := IF(@idx2_existe = 0, 'CREATE INDEX idx_turno_plantilla ON turnos_guardia(plantilla_id, inicio_programado)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Verificacion opcional:
-- SHOW COLUMNS FROM turnos_guardia LIKE 'plantilla_id';
-- SELECT * FROM plantillas_turno;
