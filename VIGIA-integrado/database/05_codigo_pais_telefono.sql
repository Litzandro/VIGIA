-- =====================================================================
-- 05. CODIGO DE PAIS EN TELEFONOS EXISTENTES
-- Rol: Base de datos -- Ronaldo Alfaro
--
-- Hallazgo: el formulario solo pedia y guardaba el numero local de 8
-- digitos (formatTelefonoHN, public/js/common.js). El "+504" que se ve
-- en pantalla (attachPhoneCountryCode) es puramente visual, nunca viaja
-- al backend -- asi que hasta ahora la base solo tenia "99990000", no
-- "+50499990000". Dos consecuencias reales, no solo cosmeticas:
--   1) El enlace de WhatsApp de una invitacion (src/services/envioService.js,
--      wa.me/<numero>) queda armado con 8 digitos y no abre ningun chat.
--   2) Cualquier integracion futura (SMS, otra API) no puede confiar en
--      que el campo trae un numero completo.
--
-- El codigo (src/utils/telefonoHN.js) ya se corrigio para que todo
-- telefono nuevo se guarde siempre como "+504" + 8 digitos. Este script
-- es el backfill: normaliza lo que ya existia en produccion, una sola
-- vez. Es seguro correrlo mas de una vez (solo toca filas que todavia
-- NO tienen el +504), y no toca ninguna fila cuyo valor no sean
-- exactamente 8 digitos (para no inventar un +504 sobre un dato sucio
-- que en realidad necesita revisarse a mano, no auto-corregirse).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paso 1 (opcional, corre esto primero para ver que se va a tocar):
-- cuentas cuyo telefono NO tiene el codigo de pais todavia.
-- ---------------------------------------------------------------------
SELECT id, email, telefono
FROM usuarios
WHERE telefono IS NOT NULL
  AND telefono <> ''
  AND telefono NOT LIKE '+504%';

-- ---------------------------------------------------------------------
-- Paso 2: backfill real, tabla por tabla.
-- REGEXP_REPLACE deja solo digitos; solo se antepone +504 cuando
-- quedan EXACTAMENTE 8 digitos (un numero hondureño valido). Cualquier
-- otro caso (vacio, con letras raras, mas o menos digitos) se deja
-- intacto para revisarlo aparte.
-- ---------------------------------------------------------------------

UPDATE usuarios
SET telefono = CONCAT('+504', REGEXP_REPLACE(telefono, '[^0-9]', ''))
WHERE telefono IS NOT NULL
  AND telefono NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 8;

UPDATE contactos_emergencia
SET telefono = CONCAT('+504', REGEXP_REPLACE(telefono, '[^0-9]', ''))
WHERE telefono IS NOT NULL
  AND telefono NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 8;

UPDATE contactos_emergencia
SET telefono_alterno = CONCAT('+504', REGEXP_REPLACE(telefono_alterno, '[^0-9]', ''))
WHERE telefono_alterno IS NOT NULL
  AND telefono_alterno <> ''
  AND telefono_alterno NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono_alterno, '[^0-9]', '')) = 8;

UPDATE personas_autorizadas
SET telefono = CONCAT('+504', REGEXP_REPLACE(telefono, '[^0-9]', ''))
WHERE telefono IS NOT NULL
  AND telefono NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 8;

UPDATE vetos_acceso
SET telefono = CONCAT('+504', REGEXP_REPLACE(telefono, '[^0-9]', ''))
WHERE telefono IS NOT NULL
  AND telefono NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 8;

UPDATE cola_acceso
SET telefono = CONCAT('+504', REGEXP_REPLACE(telefono, '[^0-9]', ''))
WHERE telefono IS NOT NULL
  AND telefono NOT LIKE '+504%'
  AND CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 8;

-- ---------------------------------------------------------------------
-- Paso 3 (opcional, para revisar despues): filas que quedaron sin
-- tocar porque no son 8 digitos limpios -- estas si necesitan mirarse
-- a mano, uno por uno.
-- ---------------------------------------------------------------------
SELECT 'usuarios' AS tabla, id, telefono FROM usuarios
  WHERE telefono IS NOT NULL AND telefono <> '' AND telefono NOT LIKE '+504%'
UNION ALL
SELECT 'contactos_emergencia', id, telefono FROM contactos_emergencia
  WHERE telefono IS NOT NULL AND telefono <> '' AND telefono NOT LIKE '+504%'
UNION ALL
SELECT 'personas_autorizadas', id, telefono FROM personas_autorizadas
  WHERE telefono IS NOT NULL AND telefono <> '' AND telefono NOT LIKE '+504%'
UNION ALL
SELECT 'vetos_acceso', id, telefono FROM vetos_acceso
  WHERE telefono IS NOT NULL AND telefono <> '' AND telefono NOT LIKE '+504%';
