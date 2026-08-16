-- =====================================================================
-- 03. MEJORAS DE BASE DE DATOS -- MODULOS VISITAS (invitaciones) E
--     INCIDENCIAS
-- Rol: Base de datos -- Ronaldo Alfaro
--
-- Este script es una PROPUESTA documentada, pensada para revisarse y
-- correrse primero contra una copia de la base (no directo en Railway).
-- Cada bloque explica: el hallazgo que lo motiva, el cambio, y por que
-- es proporcional (no se reescribe todo el modulo, solo lo que tiene un
-- problema real).
-- =====================================================================


-- ============ MODULO: VISITAS (tabla invitaciones) ============

-- ---------------------------------------------------------------------
-- Mejora 1: columna real para la frecuencia de una invitacion recurrente
--
-- Hallazgo: cuando una invitacion es recurrente (bus escolar, servicio de
-- limpieza...), el "que tan seguido" NO se guarda en una columna: se
-- concatena como texto libre dentro de notas, con el formato
-- "Frecuencia: Semanal · <motivo>" (ver public/js/visitas.js linea ~843),
-- y luego para saber si una invitacion es recurrente el codigo vuelve a
-- leer ese mismo texto buscando la palabra "Frecuencia:" (visitas.js
-- linea ~254). Es un dato de negocio real escondido en un campo de texto
-- libre, detectado por coincidencia de substring.
-- Riesgo: si alguien cambia el texto de la etiqueta ("Frecuencia" ->
-- "Repetir"), o el residente edita la nota a mano, la deteccion se rompe
-- en silencio y la invitacion deja de reconocerse como recurrente.
-- ---------------------------------------------------------------------
ALTER TABLE invitaciones
  ADD COLUMN frecuencia_recurrencia ENUM('ninguna','diario','semanal','mensual')
    NOT NULL DEFAULT 'ninguna'
    AFTER tipo;

-- Backfill: recupera la frecuencia de invitaciones ya creadas antes de
-- este cambio, leyendo por unica vez el texto viejo de notas.
UPDATE invitaciones
SET frecuencia_recurrencia = CASE
    WHEN notas LIKE '%Frecuencia: Diario%'  THEN 'diario'
    WHEN notas LIKE '%Frecuencia: Semanal%' THEN 'semanal'
    WHEN notas LIKE '%Frecuencia: Mensual%' THEN 'mensual'
    ELSE 'ninguna'
END
WHERE tipo = 'temporal';


-- ---------------------------------------------------------------------
-- Mejora 2: una sola fuente de verdad para "¿esta invitacion sigue
-- vigente?"
--
-- Hallazgo: esa misma regla de negocio esta reimplementada por separado
-- en tres lugares, y no todos revisan exactamente lo mismo:
--   1) src/services/invitacionesService.js (evaluarValidez) revisa
--      estado, fechas y el contador de usos.
--   2) src/routes/overrides/accesos.js SOLO recalcula el contador de
--      usos para decidir si marca estado='usada'.
--   3) public/js/visitas.js (frontend) vuelve a comparar fechas y estado
--      por su cuenta para decidir si algo va en "proxima" o "historial".
-- Riesgo: si mañana se agrega una regla nueva (ej. "no vale si el
-- residente esta suspendido"), hay que acordarse de tocar los tres
-- lugares -- y si se olvida uno, la app da respuestas distintas segun
-- que pantalla se use.
-- Cambio: no reemplaza el backend (la validacion al dejar pasar a
-- alguien sigue siendo responsabilidad del servicio), pero le da a
-- cualquier consulta, reporte o pantalla nueva un solo lugar de donde
-- leer "lo que esta vigente ahora mismo" sin volver a escribir la regla.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_invitaciones_vigentes AS
SELECT i.*
FROM invitaciones i
WHERE i.estado NOT IN ('cancelada', 'expirada')
  AND i.usos_actuales < i.max_usos
  AND NOW() BETWEEN i.fecha_valida_desde AND i.fecha_valida_hasta;


-- ---------------------------------------------------------------------
-- Consulta de auditoria (Mejora 2, evidencia del problema real):
-- invitaciones que la app sigue mostrando como "pendiente" pero que ya
-- vencieron por fecha. Ningun archivo del backend escribe jamas
-- estado='expirada' (se puede confirmar con:
--   grep -rn "estado.*expirada\|expirada.*estado" src/
-- y no aparece ninguna escritura, solo lecturas) -- ese estado esta
-- declarado en el ENUM y se consulta, pero nunca se llega a guardar.
-- ---------------------------------------------------------------------
SELECT id, codigo_qr, estado, fecha_valida_hasta
FROM invitaciones
WHERE estado = 'pendiente'
  AND fecha_valida_hasta < NOW();


-- ============ MODULO: INCIDENCIAS ============

-- ---------------------------------------------------------------------
-- Mejora 3: catalogo real de estados en vez de ENUM, igual al patron que
-- el propio proyecto ya usa bien en tipos_incidencia
--
-- Hallazgo (bug concreto): src/routes/overrides/incidencias.js define
-- ESTADO_LABEL con una etiqueta para el estado 'en_progreso':
--   const ESTADO_LABEL = { reportada:'...', en_revision:'...',
--     en_progreso:'...', resuelta:'...', cerrada:'...' };
-- pero la columna "estado" de la tabla incidencias es
--   ENUM('reportada','en_revision','resuelta','cerrada')
-- -- 'en_progreso' NO existe en el dominio real de la columna. Es
-- codigo muerto que ademas revela una intencion de negocio (un cuarto
-- estado intermedio) que nunca se completo en la base de datos.
-- Riesgo: si alguien intenta usar ese estado (`UPDATE incidencias SET
-- estado='en_progreso' ...`), MySQL lo rechaza por no ser un valor
-- valido del ENUM; y cualquiera que lea ESTADO_LABEL asume,
-- erroneamente, que ese estado existe.
-- Cambio: mover "estado" a una tabla catalogo (mismo patron ya usado en
-- tipos_incidencia), con 'en_progreso' incluido como fila real.
-- ---------------------------------------------------------------------
CREATE TABLE estados_incidencia (
    id      TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo  VARCHAR(20) NOT NULL UNIQUE,
    nombre  VARCHAR(40) NOT NULL,
    orden   TINYINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

INSERT INTO estados_incidencia (codigo, nombre, orden) VALUES
    ('reportada',   'Reportada',   1),
    ('en_revision', 'En revisión', 2),
    ('en_progreso', 'En progreso', 3),
    ('resuelta',    'Resuelta',    4),
    ('cerrada',     'Cerrada',     5);

ALTER TABLE incidencias
  ADD COLUMN estado_id TINYINT UNSIGNED NULL AFTER estado;

UPDATE incidencias i
JOIN estados_incidencia e ON e.codigo = i.estado
SET i.estado_id = e.id;

ALTER TABLE incidencias
  MODIFY COLUMN estado_id TINYINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_inc_estado FOREIGN KEY (estado_id) REFERENCES estados_incidencia(id) ON DELETE RESTRICT;

CREATE INDEX idx_incidencias_estado_id ON incidencias(estado_id);

-- Nota: la columna vieja "estado" (ENUM) se deja en paralelo a proposito
-- durante un ciclo de despliegue, para no romper el backend que hoy
-- todavia lee/escribe ese nombre de columna. El retiro de la columna
-- ENUM es una migracion aparte, una vez que
-- src/routes/overrides/incidencias.js pase a leer/escribir estado_id.
-- Ver LEEME de esta entrega para el detalle de ese siguiente paso.


-- ---------------------------------------------------------------------
-- Consulta de auditoria: incidencias cuya prioridad contradice el nivel
-- de urgencia del catalogo de su tipo.
--
-- Hallazgo: tipos_incidencia.nivel_urgencia (por tipo, ej. "Robo" =
-- critico) e incidencias.prioridad (por incidencia individual) son dos
-- escalas de severidad separadas que nunca se comparan entre si en el
-- backend -- prioridad se toma tal cual del formulario (o de un regex
-- de palabras clave en el frontend, public/js/incidencias.js linea ~7),
-- sin relacionarse con el nivel de urgencia real del tipo elegido.
-- ---------------------------------------------------------------------
SELECT
    inc.id,
    t.nombre  AS tipo,
    t.nivel_urgencia AS urgencia_del_tipo,
    inc.prioridad    AS prioridad_asignada,
    inc.estado
FROM incidencias inc
JOIN tipos_incidencia t ON t.id = inc.tipo_incidencia_id
WHERE (t.nivel_urgencia = 'critico' AND inc.prioridad IN ('baja', 'media'))
   OR (t.nivel_urgencia = 'bajo'    AND inc.prioridad IN ('alta', 'urgente'));
