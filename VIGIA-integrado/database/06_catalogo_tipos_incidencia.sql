-- =====================================================================
-- 06. CATALOGO DE TIPOS DE INCIDENCIA (por defecto, retroactivo)
-- Rol: Base de datos -- Ronaldo Alfaro
--
-- Hallazgo: ninguna residencial nueva quedaba con filas en
-- tipos_incidencia. src/routes/overrides/residenciales.js (alta de
-- superadmin) siembra ConfiguracionesResidencial, una garita y una
-- suscripcion de prueba -- pero nunca tipos_incidencia. Lo mismo en
-- authController.js (autoregistro publico).
--
-- Consecuencia real: src/routes/overrides/incidencias.js EXIGE un
-- tipo_incidencia_id al crear una incidencia, y si no llega uno intenta
-- usar el tipo llamado exactamente "Otro" como respaldo. Sin esa fila,
-- la creacion falla con "No existe un tipo de incidencia disponible." --
-- es decir, cualquier residencial que haya quedado sin tipos no puede
-- reportar NINGUNA incidencia, ni residente ni guardia, hasta que
-- alguien entre a mano a crearlos.
--
-- El codigo ya se corrigio (src/utils/catalogoTiposIncidencia.js) para
-- que toda residencial nueva quede sembrada automaticamente. Este
-- script es el backfill: agrega el catalogo a las residenciales que YA
-- existen en produccion y que hoy tienen cero tipos. Es seguro correrlo
-- mas de una vez: cada INSERT trae su propio "WHERE NOT EXISTS", asi
-- que no duplica nada si una residencial ya tenia algunos tipos
-- cargados a mano (por ejemplo, ya tiene "Robo" pero le falta
-- "Sospechoso": el script solo agrega lo que falta).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paso 1 (opcional, para ver el alcance antes de tocar nada):
-- residenciales sin absolutamente ningun tipo de incidencia hoy.
-- ---------------------------------------------------------------------
SELECT r.id, r.nombre
FROM residenciales r
LEFT JOIN tipos_incidencia t ON t.residencial_id = r.id
WHERE t.id IS NULL;

-- ---------------------------------------------------------------------
-- Paso 2: siembra el catalogo por defecto en TODA residencial que le
-- falte cada tipo puntual (no solo a las que tienen cero).
-- ---------------------------------------------------------------------

INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Robo', 'critico', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Robo'
);

INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Incendio', 'critico', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Incendio'
);

INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Médico', 'critico', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Médico'
);

INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Accidente', 'alto', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Accidente'
);

INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Sospechoso', 'medio', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Sospechoso'
);

-- "Otro" es el mas importante de los seis: es el nombre exacto que
-- incidencias.js usa como respaldo cuando no llega tipo_incidencia_id.
INSERT INTO tipos_incidencia (residencial_id, nombre, nivel_urgencia, activo)
SELECT r.id, 'Otro', 'medio', 1
FROM residenciales r
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_incidencia t WHERE t.residencial_id = r.id AND t.nombre = 'Otro'
);

-- ---------------------------------------------------------------------
-- Paso 3 (opcional, para confirmar el resultado): cuenta cuantos tipos
-- quedo cada residencial despues del backfill -- todas deberian tener
-- 6 como minimo (los 6 del catalogo, mas cualquiera que ya tuvieran
-- cargado a mano antes).
-- ---------------------------------------------------------------------
SELECT r.id, r.nombre, COUNT(t.id) AS total_tipos
FROM residenciales r
LEFT JOIN tipos_incidencia t ON t.residencial_id = r.id
GROUP BY r.id, r.nombre
ORDER BY total_tipos ASC;
