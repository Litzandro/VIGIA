
-- =====================================================================
-- 04. RECUPERACION DE CONTRASEÑA OLVIDADA
-- =====================================================================
-- Ejecutar UNA sola vez si tu base ya existia antes de este cambio
-- (una instalacion nueva no necesita esto: database/vigia_schema.sql
-- ya incluye esta tabla).

CREATE TABLE password_resets (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id          BIGINT UNSIGNED NOT NULL,
    token_hash          VARCHAR(255) NOT NULL,
    ip_origen           VARCHAR(45)  NULL,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion    DATETIME NOT NULL,
    usado               BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_password_resets_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_password_resets_usuario ON password_resets(usuario_id, usado);
CREATE INDEX idx_password_resets_token   ON password_resets(token_hash);
