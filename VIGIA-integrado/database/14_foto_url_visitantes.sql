-- =====================================================================
-- 14. visitantes.foto_url: VARCHAR(255) -> MEDIUMTEXT
--
-- Bug real reportado: al completar un ingreso por foto/camara desde
-- Control de acceso rapido (guardia.html / control-acceso.html) con un
-- visitante nuevo (documento que no existia todavia), el backend
-- guarda la foto capturada como data URL base64 en visitantes.foto_url
-- -- una foto asi facilmente pasa de los 255 caracteres que permitia la
-- columna, y la insercion tronaba con "Data too long for column
-- 'foto_url' at row 1", tumbando el ingreso completo.
--
-- Las demas tablas que guardan fotos como base64 (cola_acceso,
-- personas_autorizadas) ya usaban MEDIUMTEXT desde el inicio --
-- visitantes se quedo atras con el VARCHAR(255) original, de cuando
-- foto_url todavia se pensaba como una URL corta a un archivo, no como
-- la imagen misma incrustada.
--
-- Es seguro correrla mas de una vez (MODIFY COLUMN no falla si la
-- columna ya tiene ese tipo).
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE visitantes MODIFY COLUMN foto_url MEDIUMTEXT NULL;
