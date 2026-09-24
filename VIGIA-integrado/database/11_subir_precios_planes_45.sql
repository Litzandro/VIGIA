-- =====================================================================
-- 11. Aumento de precio de planes_servicio (+45%)
--
-- Sube el precio_mensual de los 3 planes un 45%, como fue solicitado.
-- Precios nuevos:
--   VIGIA Esencial: L 2,500.00 -> L 3,625.00
--   VIGIA Seguro:   L 5,500.00 -> L 7,975.00
--   VIGIA Integral: L 9,500.00 -> L 13,775.00
--
-- OJO -- esto solo cambia el precio de LISTA del plan (planes_servicio).
-- Las residenciales que YA tienen una suscripcion activa guardan su
-- propio precio en suscripciones.precio_acordado, que es independiente
-- y NO se actualiza con este script. Es decir, correr esto:
--   - SI afecta: residenciales nuevas que se suscriban de aqui en
--     adelante (van a ver el precio nuevo).
--   - NO afecta: residenciales que ya estan pagando hoy (siguen con su
--     precio_acordado de antes, hasta que alguien lo cambie a mano).
--
-- Si tambien quieren subirle el precio a los clientes que YA estan
-- activos, hay que decidirlo aparte (por lo general eso implica avisarles
-- con anticipacion) -- el UPDATE de precio_acordado esta comentado al
-- final de este archivo, listo por si deciden aplicarlo tambien.
--
-- Es seguro correrlo mas de una vez (deja el precio en el mismo valor
-- final sin importar cuantas veces se ejecute).
-- =====================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

UPDATE planes_servicio SET precio_mensual = 3625.00  WHERE codigo = 'esencial';
UPDATE planes_servicio SET precio_mensual = 7975.00  WHERE codigo = 'seguro';
UPDATE planes_servicio SET precio_mensual = 13775.00 WHERE codigo = 'integral';

-- Verificacion (deberia mostrar los 3 planes con los precios nuevos):
-- SELECT codigo, nombre, precio_mensual FROM planes_servicio;

-- =====================================================================
-- OPCIONAL -- Solo si tambien deciden subirle el precio a las
-- residenciales que YA tienen una suscripcion activa hoy. Descomenten y
-- corran esto aparte, cuando lo tengan decidido (recomendable avisar
-- antes al cliente):
-- =====================================================================
-- UPDATE suscripciones s
-- JOIN planes_servicio p ON p.id = s.plan_id
-- SET s.precio_acordado = p.precio_mensual
-- WHERE s.estado = 'activa';
