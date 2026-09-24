-- =====================================================================
-- 13. Nivel de plan (Esencial/Seguro/Integral) + candado real en el
--     menu segun el plan contratado
--
-- Hasta ahora "planes_servicio" solo tenia banderas sueltas
-- (incluye_camaras, incluye_trancas) -- no habia forma de preguntar
-- "este plan es AL MENOS Seguro?" sin ir agregando una columna nueva
-- cada vez que una seccion mas del menu se vuelve exclusiva de un
-- plan. Esta migracion agrega "nivel" (1=Esencial, 2=Seguro,
-- 3=Integral) a los 3 planes ya sembrados, y corrige un dato real:
-- el plan "Seguro" tenia incluye_camaras = TRUE, aunque la propia
-- descripcion del plan ("Integral: ... camaras...") deja claro que
-- las camaras son exclusivas de Integral. Con esta migracion, "Seguro"
-- pierde el acceso a camaras que nunca debio tener segun su propia
-- descripcion -- si alguna residencial en plan Seguro llego a
-- configurar camaras, esas filas NO se borran (siguen en la tabla
-- "camaras"), pero dejan de ser visibles/editables hasta que esa
-- residencial suba a Integral.
--
-- Es seguro correrla mas de una vez.
-- =====================================================================
SET NAMES utf8mb4;

SET @col_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planes_servicio' AND COLUMN_NAME = 'nivel'
);
SET @sql := IF(@col_existe = 0,
  'ALTER TABLE planes_servicio ADD COLUMN nivel TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER precio_mensual',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE planes_servicio SET nivel = 1 WHERE codigo = 'esencial';
UPDATE planes_servicio SET nivel = 2 WHERE codigo = 'seguro';
UPDATE planes_servicio SET nivel = 3 WHERE codigo = 'integral';

-- Corrige el dato real: camaras es solo de Integral, nunca de Seguro
-- (contradecia la propia descripcion del plan sembrada desde el
-- inicio). Si algun otro plan personalizado (no uno de los 3 de
-- fabrica) ya tenia camaras activadas a proposito, esto NO lo toca --
-- solo corrige el codigo 'seguro' especificamente.
UPDATE planes_servicio SET incluye_camaras = FALSE WHERE codigo = 'seguro';

-- Verificacion opcional:
-- SELECT codigo, nombre, nivel, incluye_camaras, incluye_trancas FROM planes_servicio ORDER BY nivel;
