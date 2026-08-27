-- =====================================================================
-- 07. DIAGNOSTICO -- "promedio de atencion" poco realista
-- Rol: Base de datos -- Ronaldo Alfaro (apoyo a Gustavo, quien revisa el calculo)
--
-- Sintoma reportado: el "tiempo promedio de atencion" que muestra
-- Operaciones (public/js/operaciones.js, tarjeta "avgAccess") da
-- numeros como 6 segundos -- se ve demasiado rapido para representar
-- "un guardia revisando a alguien en la entrada".
--
-- La formula en si (src/routes/overrides/colaAcceso.js, GET /metricas)
-- esta bien calculada: promedia fecha_fin_atencion - fecha_inicio_atencion
-- sobre los ultimos 250 registros con ambas fechas. El problema no es la
-- resta, es QUE se esta promediando junto: cola_acceso mezcla dos
-- procesos con duraciones muy distintas en la misma tabla --
--   a) un visitante NUEVO, sin autorizacion previa: el guardia revisa
--      documento/foto/motivo -- toma su tiempo real.
--   b) un visitante que YA hace match con una autorizacion recurrente
--      (bus escolar, familiar, servicio domestico -- persona_autorizada_id
--      no es NULL): no hay nada que revisar, el guardia solo confirma y
--      da clic -- unos segundos es literalmente correcto para ese caso.
--
-- Si la mayoria de los registros de una residencial son del tipo (b),
-- el promedio agregado se ve artificialmente bajo aunque cada numero
-- individual sea correcto. Este script separa los dos grupos para
-- confirmarlo con datos reales antes de tocar el calculo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paso 1: promedio general (la misma cuenta que ya hace /metricas, pero
-- sobre TODO el historico en vez de solo los ultimos 250) -- punto de
-- partida para comparar contra los pasos siguientes.
-- ---------------------------------------------------------------------
SELECT
    COUNT(*) AS total_atenciones,
    ROUND(AVG(TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion)), 1) AS promedio_seg
FROM cola_acceso
WHERE fecha_inicio_atencion IS NOT NULL
  AND fecha_fin_atencion IS NOT NULL;

-- ---------------------------------------------------------------------
-- Paso 2: el mismo promedio, pero separado por si hubo coincidencia
-- automatica con una autorizacion recurrente (persona_autorizada_id) o
-- no. La hipotesis es que el grupo "con autorizacion" es el que arrastra
-- el promedio general hacia abajo.
-- ---------------------------------------------------------------------
SELECT
    CASE WHEN persona_autorizada_id IS NULL THEN 'Verificacion manual' ELSE 'Match con autorizacion recurrente' END AS tipo_atencion,
    COUNT(*) AS cantidad,
    ROUND(AVG(TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion)), 1) AS promedio_seg,
    MIN(TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion)) AS minimo_seg,
    MAX(TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion)) AS maximo_seg
FROM cola_acceso
WHERE fecha_inicio_atencion IS NOT NULL
  AND fecha_fin_atencion IS NOT NULL
GROUP BY tipo_atencion;

-- ---------------------------------------------------------------------
-- Paso 3: registros "sospechosamente" instantaneos (menos de 2
-- segundos) que NO vinieron de un match automatico -- estos si podrian
-- ser datos de prueba, un guardia dando doble clic sin revisar nada, o
-- un bug real (a diferencia del caso (b) de arriba, que es rapido por
-- una razon legitima). Vale la pena mirarlos uno por uno.
-- ---------------------------------------------------------------------
SELECT id, residencial_id, nombre_persona, resultado_validacion,
       fecha_inicio_atencion, fecha_fin_atencion,
       TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion) AS duracion_seg
FROM cola_acceso
WHERE fecha_inicio_atencion IS NOT NULL
  AND fecha_fin_atencion IS NOT NULL
  AND persona_autorizada_id IS NULL
  AND TIMESTAMPDIFF(SECOND, fecha_inicio_atencion, fecha_fin_atencion) < 2
ORDER BY fecha_fin_atencion DESC;

-- =====================================================================
-- Sugerencia para Gustavo (no aplicada aca, la decision del calculo es
-- suya): si el paso 2 confirma la hipotesis, /metricas podria calcular
-- (y mostrar) los dos promedios por separado en vez de uno solo
-- combinado -- por ejemplo agregando "tiempo_promedio_manual_seg" junto
-- al "tiempo_promedio_seg" general, filtrando por
-- "persona_autorizada_id IS NULL" en el arreglo `completed` que ya arma
-- el propio colaAcceso.js. Eso es un cambio de un par de lineas en el
-- endpoint, no de la formula.
-- =====================================================================
