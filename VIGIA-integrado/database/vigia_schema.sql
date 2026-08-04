-- =====================================================================
-- VIGIA - Verificacion Inteligente de Gestion de Incidencias y Accesos
-- Script de base de datos - MySQL 8.0+
-- =====================================================================
-- Convenciones:
--   - Nombres de tablas y columnas en espanol, snake_case.
--   - Motor InnoDB (soporte de FK y transacciones).
--   - Charset utf8mb4 (soporte completo de acentos y emojis).
--   - Llaves primarias BIGINT UNSIGNED AUTO_INCREMENT (excepto donde se
--     use UUID/CHAR para codigos publicos como el QR).
--   - "Borrado logico" (activo/estado + fecha_eliminacion) en tablas
--     maestras en vez de DELETE fisico, para preservar trazabilidad.
--   - Catalogos editables (roles, permisos, tipos_incidencia,
--     tipos_alerta) en tablas propias en vez de ENUM, para poder
--     agregar valores nuevos sin migrar el esquema.
--   - Todo dato operativo cuelga de residencial_id para soportar
--     multiples residenciales (multi-tenant) desde el dia uno.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS vigia
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE vigia;

-- =====================================================================
-- 1. NUCLEO: RESIDENCIALES, ROLES Y PERMISOS
-- =====================================================================

-- Cada fila es un condominio/residencial independiente. El
-- superadministrador administra esta tabla y todo lo demas cuelga de ella.
CREATE TABLE residenciales (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre              VARCHAR(150)    NOT NULL,
    direccion           VARCHAR(255)    NULL,
    ciudad              VARCHAR(100)    NULL,
    pais                VARCHAR(100)    NULL,
    telefono_contacto   VARCHAR(30)     NULL,
    email_contacto      VARCHAR(150)    NULL,
    zona_horaria        VARCHAR(50)     NOT NULL DEFAULT 'America/Guatemala',
    logo_url            VARCHAR(255)    NULL,
    activo              BOOLEAN         NOT NULL DEFAULT TRUE,
    fecha_creacion      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
    fecha_eliminacion   DATETIME        NULL
) ENGINE=InnoDB;

-- Catalogo de roles. Editable: se puede agregar un rol nuevo sin tocar
-- el esquema (ej. "supervisor de zona").
CREATE TABLE roles (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo      VARCHAR(40)  NOT NULL UNIQUE,   -- superadmin, admin, guardia, residente
    nombre      VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    nivel       TINYINT UNSIGNED NOT NULL DEFAULT 0, -- jerarquia, mayor = mas privilegios
    activo      BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- Catalogo de permisos atomicos, agrupados por modulo. Permite un
-- control de acceso fino (RBAC) sin hardcodear reglas en el backend.
CREATE TABLE permisos (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo      VARCHAR(80)  NOT NULL UNIQUE,   -- ej: accesos.registrar, incidencias.ver
    modulo      VARCHAR(60)  NOT NULL,          -- ej: accesos, incidencias, reportes
    descripcion VARCHAR(255) NULL
) ENGINE=InnoDB;

-- Relacion N:M entre roles y permisos.
CREATE TABLE roles_permisos (
    rol_id     BIGINT UNSIGNED NOT NULL,
    permiso_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id)    ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. USUARIOS DEL SISTEMA (login: superadmin, admin, guardia, residente)
-- =====================================================================

-- Tabla unica de cuentas con acceso al sistema. residencial_id es NULL
-- para el superadministrador (opera sobre todas las residenciales).
CREATE TABLE usuarios (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id      BIGINT UNSIGNED NULL,
    rol_id              BIGINT UNSIGNED NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    telefono            VARCHAR(30)  NULL,
    password_hash       VARCHAR(255) NOT NULL,
    foto_url            VARCHAR(255) NULL,
    estado              ENUM('activo','inactivo','suspendido') NOT NULL DEFAULT 'activo',
    debe_cambiar_clave  BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acceso       DATETIME NULL,
    creado_por          BIGINT UNSIGNED NULL,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    fecha_eliminacion   DATETIME NULL,
    CONSTRAINT fk_usuarios_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE RESTRICT,
    CONSTRAINT fk_usuarios_rol         FOREIGN KEY (rol_id)         REFERENCES roles(id)          ON DELETE RESTRICT,
    CONSTRAINT fk_usuarios_creador     FOREIGN KEY (creado_por)     REFERENCES usuarios(id)        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_usuarios_residencial ON usuarios(residencial_id);
CREATE INDEX idx_usuarios_rol         ON usuarios(rol_id);
CREATE INDEX idx_usuarios_estado      ON usuarios(estado);

-- Control de sesiones activas (requerimiento no funcional de seguridad).
CREATE TABLE sesiones (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id          BIGINT UNSIGNED NOT NULL,
    token_hash          VARCHAR(255) NOT NULL,
    dispositivo         VARCHAR(150) NULL,
    ip_origen           VARCHAR(45)  NULL,
    fecha_inicio        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion    DATETIME NOT NULL,
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id, activa);

-- =====================================================================
-- 3. VIVIENDAS Y RESIDENTES
-- =====================================================================

CREATE TABLE viviendas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    numero          VARCHAR(20)  NOT NULL,       -- numero de casa/apartamento
    bloque_torre    VARCHAR(20)  NULL,
    tipo            VARCHAR(40)  NULL,           -- casa, apartamento, local
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_viviendas_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    UNIQUE KEY uq_vivienda (residencial_id, bloque_torre, numero)
) ENGINE=InnoDB;

-- Extiende usuarios (rol=residente) con datos propios de residencia.
CREATE TABLE residentes (
    usuario_id      BIGINT UNSIGNED PRIMARY KEY,
    vivienda_id     BIGINT UNSIGNED NOT NULL,
    tipo_residente  ENUM('propietario','inquilino','familiar') NOT NULL DEFAULT 'propietario',
    fecha_ingreso   DATE NULL,
    contacto_emergencia_nombre    VARCHAR(150) NULL,
    contacto_emergencia_telefono  VARCHAR(30)  NULL,
    CONSTRAINT fk_residentes_usuario   FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE CASCADE,
    CONSTRAINT fk_residentes_vivienda  FOREIGN KEY (vivienda_id) REFERENCES viviendas(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_residentes_vivienda ON residentes(vivienda_id);

-- Extiende usuarios (rol=guardia) con datos propios de turno/empleo.
CREATE TABLE guardias (
    usuario_id      BIGINT UNSIGNED PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    numero_empleado VARCHAR(30) NULL,
    turno           ENUM('diurno','nocturno','rotativo') NOT NULL DEFAULT 'rotativo',
    CONSTRAINT fk_guardias_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)       ON DELETE CASCADE,
    CONSTRAINT fk_guardias_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4. PUNTOS DE ACCESO (garitas / entradas)
-- =====================================================================

CREATE TABLE puntos_acceso (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    nombre          VARCHAR(100) NOT NULL,     -- ej: Garita principal, Entrada vehicular sur
    tipo            ENUM('peatonal','vehicular','mixto') NOT NULL DEFAULT 'mixto',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_puntos_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4B. CAMARAS DE SEGURIDAD Y MONITOREO
-- =====================================================================
-- Ubicacion libre: una camara NO depende de un punto_acceso (puede estar
-- en un area comun, calle interna, parque, etc.). punto_acceso_id es
-- opcional, solo para las que efectivamente vigilan una garita.

CREATE TABLE camaras (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id      BIGINT UNSIGNED NOT NULL,
    punto_acceso_id     BIGINT UNSIGNED NULL,          -- opcional: solo si vigila una garita
    nombre              VARCHAR(100) NOT NULL,
    ubicacion           VARCHAR(255) NOT NULL,         -- descripcion libre: "Parque central", "Calle B, poste 4"...
    tipo                ENUM('fija','ptz','domo') NOT NULL DEFAULT 'fija',
    marca               VARCHAR(60) NULL,
    modelo              VARCHAR(60) NULL,
    direccion_ip        VARCHAR(45) NULL,
    puerto              INT UNSIGNED NULL,
    protocolo           ENUM('rtsp','http','onvif') NOT NULL DEFAULT 'rtsp',
    stream_url          VARCHAR(255) NULL,             -- URL/URI de conexion al feed en vivo
    usuario_stream      VARCHAR(100) NULL,
    clave_stream_cifrada VARCHAR(255) NULL,            -- guardar siempre cifrada/en vault, nunca en texto plano
    estado              ENUM('activa','inactiva','mantenimiento','desconectada') NOT NULL DEFAULT 'activa',
    fecha_instalacion   DATE NULL,
    ultima_conexion     DATETIME NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cam_residencial  FOREIGN KEY (residencial_id)  REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_cam_punto_acceso FOREIGN KEY (punto_acceso_id) REFERENCES puntos_acceso(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_camaras_residencial ON camaras(residencial_id, estado);

-- Metadatos de clips grabados (el archivo de video vive en almacenamiento
-- externo/CCTV; aqui solo se referencia para poder ligarlo a incidencias
-- o accesos como evidencia).
CREATE TABLE grabaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    camara_id       BIGINT UNSIGNED NOT NULL,
    fecha_inicio    DATETIME NOT NULL,
    fecha_fin       DATETIME NULL,
    motivo          ENUM('continua','evento','manual') NOT NULL DEFAULT 'evento',
    archivo_url     VARCHAR(255) NOT NULL,
    tamano_mb       DECIMAL(10,2) NULL,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_grab_camara FOREIGN KEY (camara_id) REFERENCES camaras(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_grabaciones_camara ON grabaciones(camara_id, fecha_inicio);

-- =====================================================================
-- 5. VISITANTES, INVITACIONES Y VEHICULOS
-- =====================================================================

-- Personas externas que no tienen cuenta en el sistema, identificadas
-- por documento. Se reutiliza el mismo registro en visitas futuras.
CREATE TABLE visitantes (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    apellido          VARCHAR(100) NOT NULL,
    tipo_documento    VARCHAR(30)  NULL,
    numero_documento  VARCHAR(50)  NULL,
    telefono          VARCHAR(30)  NULL,
    email             VARCHAR(150) NULL,
    foto_url          VARCHAR(255) NULL,
    fecha_registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_visitante_documento (tipo_documento, numero_documento)
) ENGINE=InnoDB;

-- Marca a un visitante como frecuente para un residente/residencial
-- especifico (agiliza registros futuros).
CREATE TABLE visitantes_frecuentes (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    residente_id    BIGINT UNSIGNED NOT NULL,
    visitante_id    BIGINT UNSIGNED NOT NULL,
    alias           VARCHAR(100) NULL,
    fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vf_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_vf_residente   FOREIGN KEY (residente_id)   REFERENCES residentes(usuario_id) ON DELETE CASCADE,
    CONSTRAINT fk_vf_visitante   FOREIGN KEY (visitante_id)   REFERENCES visitantes(id) ON DELETE CASCADE,
    UNIQUE KEY uq_visitante_frecuente (residente_id, visitante_id)
) ENGINE=InnoDB;

-- Invitaciones con codigo QR. Cubren visita unica, temporal o de evento.
CREATE TABLE invitaciones (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo_qr           CHAR(36)     NOT NULL UNIQUE,   -- UUID
    residencial_id      BIGINT UNSIGNED NOT NULL,
    residente_id        BIGINT UNSIGNED NOT NULL,       -- anfitrion
    visitante_id        BIGINT UNSIGNED NULL,           -- se puede asociar despues
    tipo                ENUM('unico_uso','temporal','evento') NOT NULL DEFAULT 'unico_uso',
    nombre_evento       VARCHAR(150) NULL,
    fecha_valida_desde  DATETIME NOT NULL,
    fecha_valida_hasta  DATETIME NOT NULL,
    max_usos            INT UNSIGNED NOT NULL DEFAULT 1,
    usos_actuales       INT UNSIGNED NOT NULL DEFAULT 0,
    estado              ENUM('pendiente','usada','expirada','cancelada') NOT NULL DEFAULT 'pendiente',
    canal_envio         ENUM('whatsapp','correo','manual') NOT NULL DEFAULT 'manual',
    notas               VARCHAR(255) NULL,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inv_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id)      ON DELETE CASCADE,
    CONSTRAINT fk_inv_residente   FOREIGN KEY (residente_id)   REFERENCES residentes(usuario_id)  ON DELETE CASCADE,
    CONSTRAINT fk_inv_visitante   FOREIGN KEY (visitante_id)   REFERENCES visitantes(id)          ON DELETE SET NULL,
    CONSTRAINT chk_inv_fechas CHECK (fecha_valida_hasta >= fecha_valida_desde)
) ENGINE=InnoDB;

CREATE INDEX idx_invitaciones_estado ON invitaciones(estado);
CREATE INDEX idx_invitaciones_residente ON invitaciones(residente_id);

-- Vehiculos de residentes o visitantes (propietario polimorfico
-- controlado: exactamente uno de los dos FKs debe existir).
CREATE TABLE vehiculos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    placa           VARCHAR(20) NOT NULL,
    marca           VARCHAR(60) NULL,
    modelo          VARCHAR(60) NULL,
    color           VARCHAR(40) NULL,
    residente_id    BIGINT UNSIGNED NULL,
    visitante_id    BIGINT UNSIGNED NULL,
    CONSTRAINT fk_veh_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id)     ON DELETE CASCADE,
    CONSTRAINT fk_veh_residente   FOREIGN KEY (residente_id)   REFERENCES residentes(usuario_id) ON DELETE CASCADE,
    CONSTRAINT fk_veh_visitante   FOREIGN KEY (visitante_id)   REFERENCES visitantes(id)         ON DELETE CASCADE,
    CONSTRAINT chk_veh_propietario CHECK (
        (residente_id IS NOT NULL AND visitante_id IS NULL) OR
        (residente_id IS NULL AND visitante_id IS NOT NULL)
    ),
    UNIQUE KEY uq_placa_residencial (residencial_id, placa)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. CONTROL DE ACCESOS (entradas y salidas)
-- =====================================================================

-- Igual que vehiculos: exactamente uno de usuario_id / visitante_id
-- identifica a la persona que se mueve (personal/residente vs visitante).
CREATE TABLE accesos (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id    BIGINT UNSIGNED NOT NULL,
    punto_acceso_id   BIGINT UNSIGNED NOT NULL,
    usuario_id        BIGINT UNSIGNED NULL,     -- residente o personal interno
    visitante_id      BIGINT UNSIGNED NULL,     -- visitante externo
    invitacion_id     BIGINT UNSIGNED NULL,     -- si aplica
    vehiculo_id       BIGINT UNSIGNED NULL,
    camara_id         BIGINT UNSIGNED NULL,     -- camara que capturo el movimiento (evidencia)
    guardia_id        BIGINT UNSIGNED NOT NULL, -- quien registro el movimiento
    turno_guardia_id  BIGINT UNSIGNED NULL,
    guardia_original_nombre VARCHAR(180) NULL,
    tipo_movimiento   ENUM('entrada','salida') NOT NULL,
    fecha_hora        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracion_proceso_seg INT UNSIGNED NULL,
    modo_registro     ENUM('qr','foto','documento','manual','offline','integracion') NOT NULL DEFAULT 'manual',
    observaciones     VARCHAR(255) NULL,
    CONSTRAINT fk_acc_residencial  FOREIGN KEY (residencial_id)  REFERENCES residenciales(id)      ON DELETE CASCADE,
    CONSTRAINT fk_acc_punto        FOREIGN KEY (punto_acceso_id) REFERENCES puntos_acceso(id)       ON DELETE RESTRICT,
    -- usuario_id/visitante_id usan RESTRICT (no SET NULL): MySQL no permite que una
    -- columna con accion ON DELETE SET NULL participe en un CHECK constraint (error 3823),
    -- porque el SET NULL podria dejar la fila en un estado que viola el CHECK. RESTRICT
    -- ademas es coherente con el principio de no borrar fisicamente usuarios/visitantes
    -- con historial: se desactivan (estado/activo), nunca se eliminan.
    CONSTRAINT fk_acc_usuario      FOREIGN KEY (usuario_id)      REFERENCES usuarios(id)            ON DELETE RESTRICT,
    CONSTRAINT fk_acc_visitante    FOREIGN KEY (visitante_id)    REFERENCES visitantes(id)          ON DELETE RESTRICT,
    CONSTRAINT fk_acc_invitacion   FOREIGN KEY (invitacion_id)   REFERENCES invitaciones(id)        ON DELETE SET NULL,
    CONSTRAINT fk_acc_vehiculo     FOREIGN KEY (vehiculo_id)     REFERENCES vehiculos(id)           ON DELETE SET NULL,
    CONSTRAINT fk_acc_camara       FOREIGN KEY (camara_id)       REFERENCES camaras(id)             ON DELETE SET NULL,
    CONSTRAINT fk_acc_guardia      FOREIGN KEY (guardia_id)      REFERENCES usuarios(id)            ON DELETE RESTRICT,
    CONSTRAINT chk_acc_persona CHECK (
        (usuario_id IS NOT NULL AND visitante_id IS NULL) OR
        (usuario_id IS NULL AND visitante_id IS NOT NULL)
    )
) ENGINE=InnoDB;

CREATE INDEX idx_accesos_fecha       ON accesos(fecha_hora);
CREATE INDEX idx_accesos_residencial ON accesos(residencial_id, fecha_hora);
CREATE INDEX idx_accesos_visitante   ON accesos(visitante_id);
CREATE INDEX idx_accesos_usuario     ON accesos(usuario_id);

-- =====================================================================
-- 7. INCIDENCIAS
-- =====================================================================

-- Catalogo editable de tipos de incidencia (robo, dano, sospechoso...).
-- residencial_id nulo = tipo global disponible para todas las residenciales.
CREATE TABLE tipos_incidencia (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NULL,
    nombre          VARCHAR(100) NOT NULL,
    nivel_urgencia  ENUM('bajo','medio','alto','critico') NOT NULL DEFAULT 'medio',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_tipoinc_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE incidencias (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id      BIGINT UNSIGNED NOT NULL,
    tipo_incidencia_id  BIGINT UNSIGNED NOT NULL,
    reportado_por       BIGINT UNSIGNED NOT NULL,   -- usuarios.id
    asignado_a          BIGINT UNSIGNED NULL,       -- usuarios.id (guardia/admin)
    guardia_original_nombre VARCHAR(180) NULL,
    titulo              VARCHAR(150) NOT NULL,
    descripcion         TEXT NOT NULL,
    visibilidad         ENUM('privada','administracion','comunidad') NOT NULL DEFAULT 'privada',
    ubicacion           VARCHAR(255) NULL,
    prioridad           ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
    estado              ENUM('reportada','en_revision','resuelta','cerrada') NOT NULL DEFAULT 'reportada',
    fecha_hora          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion    DATETIME NULL,
    cerrada_por         BIGINT UNSIGNED NULL,
    CONSTRAINT fk_inc_residencial FOREIGN KEY (residencial_id)     REFERENCES residenciales(id)     ON DELETE CASCADE,
    CONSTRAINT fk_inc_tipo        FOREIGN KEY (tipo_incidencia_id) REFERENCES tipos_incidencia(id)  ON DELETE RESTRICT,
    CONSTRAINT fk_inc_reportante  FOREIGN KEY (reportado_por)      REFERENCES usuarios(id)          ON DELETE RESTRICT,
    CONSTRAINT fk_inc_asignado    FOREIGN KEY (asignado_a)         REFERENCES usuarios(id)          ON DELETE SET NULL,
    CONSTRAINT fk_inc_cerrada_por FOREIGN KEY (cerrada_por)        REFERENCES usuarios(id)          ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_incidencias_estado     ON incidencias(estado);
CREATE INDEX idx_incidencias_residencial ON incidencias(residencial_id, fecha_hora);

-- Evidencia adjunta (fotos, videos, documentos) a una incidencia.
-- url_archivo queda opcional porque una evidencia puede venir de un archivo
-- subido a mano O de una grabacion ya existente de una camara (grabacion_id).
-- Esa regla ("al menos uno de los dos") se valida en el backend: no se
-- declara como CHECK aqui para no combinar una columna con ON DELETE SET
-- NULL dentro de un CHECK (ver nota de chk_acc_persona en la tabla accesos).
CREATE TABLE incidencias_evidencias (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    incidencia_id BIGINT UNSIGNED NOT NULL,
    tipo_archivo  ENUM('imagen','video','documento') NOT NULL,
    url_archivo   MEDIUMTEXT NULL,
    camara_id     BIGINT UNSIGNED NULL,
    grabacion_id  BIGINT UNSIGNED NULL,
    fecha_subida  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incev_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_incev_camara     FOREIGN KEY (camara_id)     REFERENCES camaras(id)     ON DELETE SET NULL,
    CONSTRAINT fk_incev_grabacion  FOREIGN KEY (grabacion_id)  REFERENCES grabaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Historial de cambios de estado / comentarios (trazabilidad).
CREATE TABLE incidencias_seguimiento (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    incidencia_id  BIGINT UNSIGNED NOT NULL,
    usuario_id     BIGINT UNSIGNED NOT NULL,
    comentario     TEXT NULL,
    estado_anterior ENUM('reportada','en_revision','resuelta','cerrada') NULL,
    estado_nuevo    ENUM('reportada','en_revision','resuelta','cerrada') NOT NULL,
    fecha_hora     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incseg_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_incseg_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =====================================================================
-- 8. ALERTAS DE PANICO / SOS Y LLEGADA SEGURA
-- =====================================================================

CREATE TABLE tipos_alerta (
    id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo  VARCHAR(30) NOT NULL UNIQUE,   -- medica, robo, incendio, otro
    nombre  VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE alertas_panico (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    usuario_id      BIGINT UNSIGNED NOT NULL,   -- quien activo el SOS
    tipo_alerta_id  BIGINT UNSIGNED NOT NULL,
    ubicacion_lat   DECIMAL(10,7) NULL,
    ubicacion_lng   DECIMAL(10,7) NULL,
    estado          ENUM('activa','atendida','falsa_alarma') NOT NULL DEFAULT 'activa',
    atendida_por    BIGINT UNSIGNED NULL,
    fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_atencion  DATETIME NULL,
    CONSTRAINT fk_alerta_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerta_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)       ON DELETE CASCADE,
    CONSTRAINT fk_alerta_tipo        FOREIGN KEY (tipo_alerta_id) REFERENCES tipos_alerta(id)   ON DELETE RESTRICT,
    CONSTRAINT fk_alerta_atendio     FOREIGN KEY (atendida_por)   REFERENCES usuarios(id)       ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_alertas_estado ON alertas_panico(estado);

-- Modo de "llegada segura": el residente comparte que va en camino y
-- el sistema/garita monitorea que confirme su llegada a tiempo.
CREATE TABLE llegadas_seguras (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id          BIGINT UNSIGNED NOT NULL,
    residente_id            BIGINT UNSIGNED NOT NULL,
    ubicacion_origen        VARCHAR(255) NULL,
    hora_estimada_llegada   DATETIME NOT NULL,
    estado                  ENUM('en_curso','completada','alerta_generada','cancelada') NOT NULL DEFAULT 'en_curso',
    contacto_confirmacion   VARCHAR(150) NULL,
    fecha_inicio            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_fin               DATETIME NULL,
    CONSTRAINT fk_llegada_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id)      ON DELETE CASCADE,
    CONSTRAINT fk_llegada_residente   FOREIGN KEY (residente_id)   REFERENCES residentes(usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. PAQUETES
-- =====================================================================

CREATE TABLE paquetes (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    vivienda_id     BIGINT UNSIGNED NOT NULL,
    recibido_por    BIGINT UNSIGNED NOT NULL,   -- guardia
    entregado_a     BIGINT UNSIGNED NULL,       -- residente que lo retiro
    descripcion     VARCHAR(255) NULL,
    empresa_envio   VARCHAR(100) NULL,
    estado          ENUM('pendiente','entregado','devuelto') NOT NULL DEFAULT 'pendiente',
    fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega   DATETIME NULL,
    CONSTRAINT fk_paq_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_paq_vivienda    FOREIGN KEY (vivienda_id)    REFERENCES viviendas(id)      ON DELETE CASCADE,
    CONSTRAINT fk_paq_recibio     FOREIGN KEY (recibido_por)   REFERENCES usuarios(id)       ON DELETE RESTRICT,
    CONSTRAINT fk_paq_entrego     FOREIGN KEY (entregado_a)    REFERENCES usuarios(id)       ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_paquetes_estado ON paquetes(estado);

-- =====================================================================
-- 10. NOTIFICACIONES
-- =====================================================================

-- referencia_tipo/referencia_id apuntan de forma generica a la fila que
-- origino la notificacion (acceso, paquete, incidencia, alerta...), sin
-- necesidad de una FK por cada modulo nuevo que se agregue a futuro.
CREATE TABLE notificaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL,   -- destinatario
    tipo            VARCHAR(40)  NOT NULL,      -- ingreso_visita, paquete, alerta, incidencia...
    titulo          VARCHAR(150) NOT NULL,
    mensaje         VARCHAR(255) NOT NULL,
    referencia_tipo VARCHAR(40)  NULL,          -- ej: 'accesos', 'paquetes'
    referencia_id   BIGINT UNSIGNED NULL,
    leida           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_notif_usuario_leida ON notificaciones(usuario_id, leida);

-- =====================================================================
-- 11. CHAT / COMUNICACION INTERNA
-- =====================================================================

CREATE TABLE conversaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NOT NULL,
    tipo            ENUM('directa','grupo') NOT NULL DEFAULT 'directa',
    nombre          VARCHAR(150) NULL,          -- solo si tipo = grupo
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conv_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE conversaciones_participantes (
    conversacion_id BIGINT UNSIGNED NOT NULL,
    usuario_id      BIGINT UNSIGNED NOT NULL,
    fecha_union     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversacion_id, usuario_id),
    CONSTRAINT fk_convp_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_convp_usuario      FOREIGN KEY (usuario_id)      REFERENCES usuarios(id)       ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE mensajes (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversacion_id BIGINT UNSIGNED NOT NULL,
    usuario_id      BIGINT UNSIGNED NOT NULL,   -- remitente
    contenido       TEXT NOT NULL,
    tipo_contenido  ENUM('texto','imagen','archivo') NOT NULL DEFAULT 'texto',
    leido           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_usuario      FOREIGN KEY (usuario_id)      REFERENCES usuarios(id)       ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_mensajes_conversacion ON mensajes(conversacion_id, fecha_hora);

-- =====================================================================
-- 12. REPORTES Y BITACORA (auditoria/trazabilidad)
-- =====================================================================

-- Registro de reportes generados desde el panel (para descarga posterior
-- y para no recalcular reportes pesados repetidamente).
CREATE TABLE reportes_generados (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id    BIGINT UNSIGNED NOT NULL,
    usuario_id        BIGINT UNSIGNED NOT NULL,
    tipo_reporte      VARCHAR(60)  NOT NULL,   -- accesos, visitas, incidentes, residentes, actividad
    parametros_json   JSON NULL,
    archivo_url       VARCHAR(255) NULL,
    fecha_generacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rep_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_rep_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)       ON DELETE CASCADE
) ENGINE=InnoDB;

-- Bitacora general: registra toda accion importante del sistema
-- (requerimiento funcional 17 y no funcional de trazabilidad).
CREATE TABLE bitacora (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id  BIGINT UNSIGNED NULL,
    usuario_id      BIGINT UNSIGNED NULL,
    accion          VARCHAR(100) NOT NULL,   -- ej: 'crear_invitacion', 'login', 'editar_residente'
    modulo          VARCHAR(60)  NOT NULL,
    entidad_afectada VARCHAR(60) NULL,       -- nombre de tabla afectada
    entidad_id      BIGINT UNSIGNED NULL,
    detalles_json   JSON NULL,
    ip_origen       VARCHAR(45) NULL,
    fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bit_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE SET NULL,
    CONSTRAINT fk_bit_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)       ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_bitacora_fecha ON bitacora(fecha_hora);
CREATE INDEX idx_bitacora_usuario ON bitacora(usuario_id);


-- =====================================================================
-- 12B. AMPLIACIONES DE RETROALIMENTACION (VIGIA 2.0)
-- =====================================================================

-- Parametros operativos por residencial: tiempos objetivo, cola, turnos,
-- zona horaria y requisitos de evidencia. El uso de una zona IANA evita
-- depender de la hora del telefono y permite manejar cambios de horario.
CREATE TABLE configuraciones_residencial (
    residencial_id                BIGINT UNSIGNED PRIMARY KEY,
    tiempo_objetivo_acceso_seg    INT UNSIGNED NOT NULL DEFAULT 90,
    limite_cola_alerta            INT UNSIGNED NOT NULL DEFAULT 5,
    tolerancia_turno_min          INT UNSIGNED NOT NULL DEFAULT 15,
    tiempo_sesion_inactiva_min    INT UNSIGNED NOT NULL DEFAULT 30,
    requiere_foto_visitante       BOOLEAN NOT NULL DEFAULT TRUE,
    requiere_evidencia_guardia    BOOLEAN NOT NULL DEFAULT TRUE,
    modo_offline_habilitado       BOOLEAN NOT NULL DEFAULT TRUE,
    zona_horaria                  VARCHAR(50) NOT NULL DEFAULT 'America/Tegucigalpa',
    fecha_actualizacion           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_confres_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Personas con autorización recurrente: buses escolares, familiares,
-- personal doméstico, proveedores y otros servicios habituales.
CREATE TABLE personas_autorizadas (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    residente_id          BIGINT UNSIGNED NOT NULL,
    tipo                  ENUM('bus_escolar','familiar','servicio_domestico','proveedor','transporte','otro') NOT NULL,
    nombre_completo       VARCHAR(180) NOT NULL,
    tipo_documento        VARCHAR(30) NULL,
    numero_documento      VARCHAR(50) NULL,
    telefono              VARCHAR(30) NULL,
    empresa               VARCHAR(120) NULL,
    placa_vehiculo        VARCHAR(20) NULL,
    foto_url              MEDIUMTEXT NULL,
    dias_semana_json      JSON NULL,
    hora_desde            VARCHAR(5) NULL,
    hora_hasta            VARCHAR(5) NULL,
    fecha_desde           DATE NULL,
    fecha_hasta           DATE NULL,
    max_accesos_dia       INT UNSIGNED NOT NULL DEFAULT 2,
    estado                ENUM('pendiente','activa','suspendida','vencida','cancelada') NOT NULL DEFAULT 'pendiente',
    notas                 VARCHAR(255) NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_paut_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_paut_residente   FOREIGN KEY (residente_id) REFERENCES residentes(usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_paut_documento ON personas_autorizadas(residencial_id, numero_documento);
CREATE INDEX idx_paut_estado ON personas_autorizadas(residencial_id, estado);

-- Solicitudes y vetos aprobados. El residente puede solicitar un veto para
-- su vivienda; un veto global requiere revisión administrativa.
CREATE TABLE vetos_acceso (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    solicitado_por        BIGINT UNSIGNED NOT NULL,
    aprobado_por          BIGINT UNSIGNED NULL,
    visitante_id          BIGINT UNSIGNED NULL,
    nombre_persona        VARCHAR(180) NOT NULL,
    tipo_documento        VARCHAR(30) NULL,
    numero_documento      VARCHAR(50) NULL,
    telefono              VARCHAR(30) NULL,
    alcance               ENUM('vivienda','residencial') NOT NULL DEFAULT 'vivienda',
    motivo                VARCHAR(255) NOT NULL,
    evidencia_url         MEDIUMTEXT NULL,
    estado                ENUM('pendiente','activo','rechazado','revocado','vencido') NOT NULL DEFAULT 'pendiente',
    fecha_desde           DATETIME NULL,
    fecha_hasta           DATETIME NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion      DATETIME NULL,
    CONSTRAINT fk_veto_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_veto_solicitante FOREIGN KEY (solicitado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_veto_aprobador   FOREIGN KEY (aprobado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_veto_visitante   FOREIGN KEY (visitante_id) REFERENCES visitantes(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_veto_documento ON vetos_acceso(residencial_id, numero_documento, estado);

-- Conflictos entre una autorización y un veto. La garita no puede resolver
-- silenciosamente: debe escalar a administrador y dejar trazabilidad.
CREATE TABLE conflictos_permisos (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id          BIGINT UNSIGNED NOT NULL,
    persona_autorizada_id   BIGINT UNSIGNED NULL,
    veto_id                 BIGINT UNSIGNED NULL,
    nombre_persona          VARCHAR(180) NOT NULL,
    numero_documento        VARCHAR(50) NULL,
    descripcion             VARCHAR(255) NOT NULL,
    estado                  ENUM('abierto','en_revision','resuelto_autorizar','resuelto_bloquear','cerrado') NOT NULL DEFAULT 'abierto',
    detectado_por           BIGINT UNSIGNED NULL,
    resuelto_por            BIGINT UNSIGNED NULL,
    resolucion              VARCHAR(255) NULL,
    fecha_deteccion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion        DATETIME NULL,
    CONSTRAINT fk_conflicto_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_conflicto_autorizado FOREIGN KEY (persona_autorizada_id) REFERENCES personas_autorizadas(id) ON DELETE SET NULL,
    CONSTRAINT fk_conflicto_veto FOREIGN KEY (veto_id) REFERENCES vetos_acceso(id) ON DELETE SET NULL,
    CONSTRAINT fk_conflicto_detecto FOREIGN KEY (detectado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_conflicto_resolvio FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_conflicto_estado ON conflictos_permisos(residencial_id, estado);

-- Jornadas y relevos. Se conserva el guardia original aun cuando otro
-- guardia termine el proceso después de un cambio de turno.
CREATE TABLE turnos_guardia (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    punto_acceso_id       BIGINT UNSIGNED NULL,
    guardia_original_id   BIGINT UNSIGNED NOT NULL,
    guardia_relevo_id     BIGINT UNSIGNED NULL,
    inicio_programado     DATETIME NOT NULL,
    fin_programado        DATETIME NOT NULL,
    inicio_real           DATETIME NULL,
    fin_real              DATETIME NULL,
    estado                ENUM('programado','activo','relevado','finalizado','ausente') NOT NULL DEFAULT 'programado',
    observaciones         VARCHAR(255) NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_turno_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_turno_punto FOREIGN KEY (punto_acceso_id) REFERENCES puntos_acceso(id) ON DELETE SET NULL,
    CONSTRAINT fk_turno_original FOREIGN KEY (guardia_original_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_turno_relevo FOREIGN KEY (guardia_relevo_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_turno_activo ON turnos_guardia(residencial_id, estado, inicio_programado);

-- Cola de garita y registro rápido. Se mide llegada, inicio y fin para
-- conocer el tiempo real y alertar cuando se supera el objetivo.
CREATE TABLE cola_acceso (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id          BIGINT UNSIGNED NOT NULL,
    punto_acceso_id         BIGINT UNSIGNED NOT NULL,
    invitacion_id           BIGINT UNSIGNED NULL,
    persona_autorizada_id   BIGINT UNSIGNED NULL,
    visitante_id            BIGINT UNSIGNED NULL,
    nombre_persona          VARCHAR(180) NOT NULL,
    tipo_documento          VARCHAR(30) NULL,
    numero_documento        VARCHAR(50) NULL,
    telefono                VARCHAR(30) NULL,
    placa_vehiculo          VARCHAR(20) NULL,
    foto_url                MEDIUMTEXT NULL,
    motivo                  VARCHAR(180) NULL,
    vivienda_destino        VARCHAR(60) NULL,
    origen_registro         ENUM('qr','foto','documento','manual','offline','integracion') NOT NULL DEFAULT 'manual',
    prioridad               ENUM('normal','adulto_mayor','emergencia','servicio_esencial') NOT NULL DEFAULT 'normal',
    estado                  ENUM('esperando','en_validacion','autorizada','bloqueada','rechazada','completada','cancelada') NOT NULL DEFAULT 'esperando',
    resultado_validacion    ENUM('pendiente','valida','veto','conflicto','fuera_horario','expirada','incompleta') NOT NULL DEFAULT 'pendiente',
    guardia_original_id     BIGINT UNSIGNED NULL,
    guardia_actual_id       BIGINT UNSIGNED NULL,
    turno_guardia_id        BIGINT UNSIGNED NULL,
    fecha_llegada           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio_atencion   DATETIME NULL,
    fecha_fin_atencion      DATETIME NULL,
    observaciones           VARCHAR(255) NULL,
    CONSTRAINT fk_cola_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_cola_punto FOREIGN KEY (punto_acceso_id) REFERENCES puntos_acceso(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cola_invitacion FOREIGN KEY (invitacion_id) REFERENCES invitaciones(id) ON DELETE SET NULL,
    CONSTRAINT fk_cola_autorizado FOREIGN KEY (persona_autorizada_id) REFERENCES personas_autorizadas(id) ON DELETE SET NULL,
    CONSTRAINT fk_cola_visitante FOREIGN KEY (visitante_id) REFERENCES visitantes(id) ON DELETE SET NULL,
    CONSTRAINT fk_cola_guardia_original FOREIGN KEY (guardia_original_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_cola_guardia_actual FOREIGN KEY (guardia_actual_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_cola_turno FOREIGN KEY (turno_guardia_id) REFERENCES turnos_guardia(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_cola_estado ON cola_acceso(residencial_id, punto_acceso_id, estado, fecha_llegada);

-- Evidencias tomadas por el guardia durante el acceso: fotografía,
-- documento, placa o captura de cámara.
CREATE TABLE evidencias_acceso (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id      BIGINT UNSIGNED NOT NULL,
    cola_acceso_id      BIGINT UNSIGNED NULL,
    acceso_id           BIGINT UNSIGNED NULL,
    guardia_id          BIGINT UNSIGNED NOT NULL,
    tipo                ENUM('foto_persona','foto_documento','foto_vehiculo','captura_camara','otro') NOT NULL,
    url_archivo         MEDIUMTEXT NOT NULL,
    descripcion         VARCHAR(255) NULL,
    fecha_captura       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evacc_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_evacc_cola FOREIGN KEY (cola_acceso_id) REFERENCES cola_acceso(id) ON DELETE CASCADE,
    CONSTRAINT fk_evacc_acceso FOREIGN KEY (acceso_id) REFERENCES accesos(id) ON DELETE CASCADE,
    CONSTRAINT fk_evacc_guardia FOREIGN KEY (guardia_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Conectores preparados para trancas, cámaras, sistemas existentes,
-- webhooks y servicios de IA. Las credenciales reales se mantienen fuera
-- del navegador; secreto_referencia apunta a un secreto del servidor.
CREATE TABLE integraciones (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    tipo                  ENUM('tranca','camara','sistema_colonia','webhook','ia','control_acceso') NOT NULL,
    nombre                VARCHAR(120) NOT NULL,
    proveedor             VARCHAR(120) NULL,
    endpoint_url          VARCHAR(255) NULL,
    secreto_referencia    VARCHAR(120) NULL,
    configuracion_json    JSON NULL,
    modo                  ENUM('simulador','pruebas','produccion') NOT NULL DEFAULT 'simulador',
    estado                ENUM('activa','inactiva','error','mantenimiento') NOT NULL DEFAULT 'inactiva',
    ultima_sincronizacion DATETIME NULL,
    activo                BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_integracion_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE eventos_integracion (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    integracion_id      BIGINT UNSIGNED NOT NULL,
    usuario_id          BIGINT UNSIGNED NULL,
    accion              VARCHAR(80) NOT NULL,
    estado              ENUM('pendiente','exitoso','fallido','simulado') NOT NULL DEFAULT 'pendiente',
    solicitud_json      JSON NULL,
    respuesta_json      JSON NULL,
    fecha_hora          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eventint_integracion FOREIGN KEY (integracion_id) REFERENCES integraciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_eventint_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Modelo comercial para que el superadministrador gestione clientes,
-- planes, suscripciones y estado del servicio.
CREATE TABLE planes_servicio (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo                VARCHAR(40) NOT NULL UNIQUE,
    nombre                VARCHAR(100) NOT NULL,
    descripcion           VARCHAR(255) NULL,
    precio_mensual        DECIMAL(12,2) NOT NULL DEFAULT 0,
    max_viviendas         INT UNSIGNED NULL,
    max_guardias          INT UNSIGNED NULL,
    incluye_camaras       BOOLEAN NOT NULL DEFAULT FALSE,
    incluye_trancas       BOOLEAN NOT NULL DEFAULT FALSE,
    incluye_soporte       BOOLEAN NOT NULL DEFAULT TRUE,
    activo                BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE suscripciones (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    plan_id               BIGINT UNSIGNED NOT NULL,
    estado                ENUM('prueba','activa','suspendida','vencida','cancelada') NOT NULL DEFAULT 'prueba',
    fecha_inicio          DATE NOT NULL,
    fecha_fin_prueba      DATE NULL,
    proxima_facturacion   DATE NULL,
    precio_acordado       DECIMAL(12,2) NULL,
    ciclo                 ENUM('mensual','trimestral','anual') NOT NULL DEFAULT 'mensual',
    notas                 VARCHAR(255) NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_susc_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_susc_plan FOREIGN KEY (plan_id) REFERENCES planes_servicio(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Directorio visible y rápido de emergencias. Puede contener contactos
-- generales de la colonia o contactos privados del residente.
CREATE TABLE contactos_emergencia (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    usuario_id            BIGINT UNSIGNED NULL,
    categoria             ENUM('seguridad','medica','bomberos','administracion','familiar','otro') NOT NULL,
    nombre                VARCHAR(150) NOT NULL,
    telefono              VARCHAR(30) NOT NULL,
    telefono_alterno      VARCHAR(30) NULL,
    disponible_24h        BOOLEAN NOT NULL DEFAULT FALSE,
    privado               BOOLEAN NOT NULL DEFAULT FALSE,
    orden_visual          INT UNSIGNED NOT NULL DEFAULT 0,
    activo                BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_contacto_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_contacto_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Preferencias persistentes de accesibilidad y modo simplificado.
CREATE TABLE preferencias_usuario (
    usuario_id            BIGINT UNSIGNED PRIMARY KEY,
    tema                  ENUM('claro','suave','oscuro','alto_contraste') NOT NULL DEFAULT 'suave',
    filtro_color          ENUM('ninguno','escala_grises','deuteranopia','protanopia','tritanopia') NOT NULL DEFAULT 'ninguno',
    tamano_texto          ENUM('normal','grande','extra_grande') NOT NULL DEFAULT 'normal',
    modo_simple           BOOLEAN NOT NULL DEFAULT FALSE,
    lectura_asistida      BOOLEAN NOT NULL DEFAULT FALSE,
    reducir_movimiento    BOOLEAN NOT NULL DEFAULT FALSE,
    biometria_preferida   BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_actualizacion   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pref_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Registro idempotente de acciones creadas sin internet. El client_uid
-- evita duplicados cuando el teléfono reintenta al recuperar señal.
CREATE TABLE acciones_offline (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_uid            CHAR(36) NOT NULL UNIQUE,
    usuario_id            BIGINT UNSIGNED NOT NULL,
    residencial_id        BIGINT UNSIGNED NULL,
    modulo                VARCHAR(60) NOT NULL,
    accion                VARCHAR(60) NOT NULL,
    payload_json          JSON NOT NULL,
    estado                ENUM('recibida','procesada','error','duplicada') NOT NULL DEFAULT 'recibida',
    intentos              INT UNSIGNED NOT NULL DEFAULT 0,
    mensaje_error         VARCHAR(255) NULL,
    fecha_cliente         DATETIME NULL,
    fecha_recepcion       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_procesamiento   DATETIME NULL,
    CONSTRAINT fk_offline_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_offline_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Muro de comunidad con visibilidad pública, de torre o privada para
-- administración, en lugar de depender únicamente de localStorage.
CREATE TABLE publicaciones_comunidad (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    residencial_id        BIGINT UNSIGNED NOT NULL,
    usuario_id            BIGINT UNSIGNED NOT NULL,
    categoria             VARCHAR(60) NOT NULL DEFAULT 'General',
    contenido             VARCHAR(500) NOT NULL,
    visibilidad           ENUM('residencial','torre','administracion') NOT NULL DEFAULT 'residencial',
    bloque_torre          VARCHAR(20) NULL,
    estado                ENUM('publicada','oculta','eliminada') NOT NULL DEFAULT 'publicada',
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pub_residencial FOREIGN KEY (residencial_id) REFERENCES residenciales(id) ON DELETE CASCADE,
    CONSTRAINT fk_pub_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Resultado del filtro automático del chat. No se envía contenido a una
-- IA externa por defecto; el adaptador puede activarse desde integraciones.
CREATE TABLE moderacion_mensajes (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mensaje_id            BIGINT UNSIGNED NOT NULL UNIQUE,
    motor                 ENUM('reglas_locales','ia_externa','revision_manual') NOT NULL DEFAULT 'reglas_locales',
    estado                ENUM('permitido','advertencia','retenido','rechazado') NOT NULL DEFAULT 'permitido',
    categoria             VARCHAR(60) NULL,
    puntaje               DECIMAL(5,2) NULL,
    detalle               VARCHAR(255) NULL,
    revisado_por          BIGINT UNSIGNED NULL,
    fecha_revision        DATETIME NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mod_mensaje FOREIGN KEY (mensaje_id) REFERENCES mensajes(id) ON DELETE CASCADE,
    CONSTRAINT fk_mod_revisor FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Dispositivos confiables y estado de biometría/WebAuthn. La clave pública
-- real se incorporará mediante un adaptador WebAuthn en una etapa posterior.
CREATE TABLE dispositivos_usuario (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id            BIGINT UNSIGNED NOT NULL,
    nombre                VARCHAR(120) NOT NULL,
    identificador         VARCHAR(180) NOT NULL,
    plataforma            VARCHAR(80) NULL,
    biometria_disponible  BOOLEAN NOT NULL DEFAULT FALSE,
    biometria_habilitada  BOOLEAN NOT NULL DEFAULT FALSE,
    confiable             BOOLEAN NOT NULL DEFAULT FALSE,
    revocado              BOOLEAN NOT NULL DEFAULT FALSE,
    ultimo_uso            DATETIME NULL,
    fecha_registro        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_disp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY uq_disp_usuario (usuario_id, identificador)
) ENGINE=InnoDB;

-- La columna turno_guardia_id se definió en accesos; la FK se agrega aquí
-- porque turnos_guardia se crea después de accesos en este script.
ALTER TABLE accesos
    ADD CONSTRAINT fk_acc_turno FOREIGN KEY (turno_guardia_id) REFERENCES turnos_guardia(id) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 13. VISTAS UTILES PARA EL MODULO DE REPORTES / PANEL PRINCIPAL
-- =====================================================================

-- Historial de accesos legible, con nombre de la persona resuelto sin
-- importar si es residente/personal o visitante.
CREATE OR REPLACE VIEW vista_historial_accesos AS
SELECT
    a.id,
    a.residencial_id,
    r.nombre AS residencial_nombre,
    pa.nombre AS punto_acceso,
    a.tipo_movimiento,
    a.fecha_hora,
    COALESCE(CONCAT(u.nombre, ' ', u.apellido), CONCAT(v.nombre, ' ', v.apellido)) AS persona,
    CASE WHEN a.usuario_id IS NOT NULL THEN 'interno' ELSE 'visitante' END AS tipo_persona,
    veh.placa AS placa_vehiculo,
    g.nombre AS guardia_nombre
FROM accesos a
JOIN residenciales r        ON r.id = a.residencial_id
JOIN puntos_acceso pa       ON pa.id = a.punto_acceso_id
LEFT JOIN usuarios u        ON u.id = a.usuario_id
LEFT JOIN visitantes v      ON v.id = a.visitante_id
LEFT JOIN vehiculos veh     ON veh.id = a.vehiculo_id
LEFT JOIN usuarios g        ON g.id = a.guardia_id;

-- Incidencias abiertas (no cerradas) con prioridad, para el panel
-- principal de guardias/administradores.
CREATE OR REPLACE VIEW vista_incidencias_abiertas AS
SELECT
    i.id,
    i.residencial_id,
    ti.nombre AS tipo_incidencia,
    i.titulo,
    i.prioridad,
    i.estado,
    i.fecha_hora,
    CONCAT(u.nombre, ' ', u.apellido) AS reportado_por
FROM incidencias i
JOIN tipos_incidencia ti ON ti.id = i.tipo_incidencia_id
JOIN usuarios u          ON u.id = i.reportado_por
WHERE i.estado <> 'cerrada';

-- Estadisticas rapidas por residencial para el panel principal.
CREATE OR REPLACE VIEW vista_estadisticas_residencial AS
SELECT
    r.id AS residencial_id,
    r.nombre AS residencial_nombre,
    (SELECT COUNT(*) FROM residentes re JOIN viviendas vi ON vi.id = re.vivienda_id WHERE vi.residencial_id = r.id) AS total_residentes,
    (SELECT COUNT(*) FROM accesos a WHERE a.residencial_id = r.id AND DATE(a.fecha_hora) = CURDATE()) AS accesos_hoy,
    (SELECT COUNT(*) FROM incidencias i WHERE i.residencial_id = r.id AND i.estado <> 'cerrada') AS incidencias_abiertas,
    (SELECT COUNT(*) FROM alertas_panico al WHERE al.residencial_id = r.id AND al.estado = 'activa') AS alertas_activas,
    (SELECT COUNT(*) FROM paquetes p WHERE p.residencial_id = r.id AND p.estado = 'pendiente') AS paquetes_pendientes,
    (SELECT COUNT(*) FROM camaras c WHERE c.residencial_id = r.id AND c.activo = TRUE) AS camaras_activas,
    (SELECT COUNT(*) FROM camaras c WHERE c.residencial_id = r.id AND c.estado IN ('desconectada','mantenimiento') AND c.activo = TRUE) AS camaras_con_problema
FROM residenciales r;

-- Estado de cada camara para la vista de monitoreo del panel principal.
CREATE OR REPLACE VIEW vista_camaras_monitoreo AS
SELECT
    c.id,
    c.residencial_id,
    c.nombre,
    c.ubicacion,
    pa.nombre AS punto_acceso,
    c.estado,
    c.stream_url,
    c.ultima_conexion
FROM camaras c
LEFT JOIN puntos_acceso pa ON pa.id = c.punto_acceso_id
WHERE c.activo = TRUE;

-- =====================================================================
-- 14. DATOS SEMILLA (catalogos base para que el sistema sea funcional
--     desde la primera instalacion)
-- =====================================================================

INSERT INTO roles (codigo, nombre, descripcion, nivel) VALUES
    ('superadmin', 'Superadministrador', 'Administra residenciales, permisos y cuentas administrativas', 100),
    ('admin',      'Administrador',      'Gestiona usuarios, residentes, guardias, reportes y configuraciones', 80),
    ('guardia',    'Guardia de seguridad','Verifica visitantes, registra accesos y atiende alertas', 40),
    ('residente',  'Residente',          'Registra visitas, consulta accesos y reporta incidencias', 20);

INSERT INTO permisos (codigo, modulo, descripcion) VALUES
    ('residenciales.gestionar', 'residenciales', 'Crear, editar y desactivar residenciales'),
    ('usuarios.gestionar',      'usuarios',      'Crear, editar, consultar y desactivar usuarios'),
    ('visitas.crear',           'visitas',       'Crear invitaciones para visitantes'),
    ('accesos.registrar',       'accesos',       'Registrar entradas y salidas'),
    ('accesos.consultar',       'accesos',       'Consultar historial de accesos'),
    ('incidencias.reportar',    'incidencias',   'Reportar una incidencia'),
    ('incidencias.gestionar',   'incidencias',   'Cambiar estado y dar seguimiento a incidencias'),
    ('alertas.emitir',          'alertas',       'Enviar alerta de panico/SOS'),
    ('alertas.atender',         'alertas',       'Atender una alerta de panico/SOS'),
    ('reportes.generar',        'reportes',      'Generar reportes del sistema'),
    ('chat.usar',                'chat',         'Enviar y recibir mensajes internos'),
    ('camaras.gestionar',        'camaras',      'Registrar y configurar camaras (streaming, ubicacion, estado)'),
    ('camaras.ver',              'camaras',      'Ver el monitoreo en vivo y las grabaciones de las camaras'),
    ('autorizados.gestionar',    'autorizados',  'Gestionar personas y servicios con acceso recurrente'),
    ('vetos.solicitar',          'vetos',        'Solicitar el veto de una persona para la vivienda'),
    ('vetos.consultar',          'vetos',        'Consultar alertas de veto en garita'),
    ('vetos.gestionar',          'vetos',        'Aprobar, revocar y resolver vetos o conflictos'),
    ('cola.gestionar',           'cola',         'Gestionar la cola y el registro rapido de garita'),
    ('turnos.consultar',         'turnos',       'Consultar el turno y los relevos de guardia'),
    ('turnos.gestionar',         'turnos',       'Programar jornadas y relevos de guardias'),
    ('integraciones.gestionar',  'integraciones','Configurar trancas, camaras, webhooks y sistemas externos'),
    ('suscripciones.gestionar',  'suscripciones','Gestionar planes, clientes y suscripciones'),
    ('emergencias.consultar',    'emergencias',  'Consultar el directorio de contactos de emergencia'),
    ('emergencias.gestionar',    'emergencias',  'Gestionar contactos de emergencia'),
    ('comunidad.publicar',       'comunidad',    'Crear publicaciones comunitarias o privadas'),
    ('offline.sincronizar',      'offline',      'Sincronizar acciones creadas sin conexion');

-- Asignacion de permisos por rol (ejemplo base, ajustable desde el panel de administracion)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p WHERE r.codigo = 'superadmin';

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.codigo = 'admin' AND p.codigo NOT IN ('residenciales.gestionar','suscripciones.gestionar');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.codigo = 'guardia' AND p.codigo IN
    ('accesos.registrar','accesos.consultar','incidencias.reportar','incidencias.gestionar','alertas.atender','chat.usar','camaras.ver','cola.gestionar','turnos.consultar','vetos.consultar','emergencias.consultar','offline.sincronizar');

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.codigo = 'residente' AND p.codigo IN
    ('visitas.crear','accesos.consultar','incidencias.reportar','alertas.emitir','chat.usar','autorizados.gestionar','vetos.solicitar','emergencias.consultar','comunidad.publicar','offline.sincronizar');
-- Nota: por privacidad, el residente no tiene camaras.ver por defecto (solo guardia/admin/superadmin).
-- Si la residencial quiere dar acceso a residentes a ciertas camaras (ej. su propia calle),
-- se recomienda un permiso mas granular a futuro en vez de abrir camaras.ver por completo.

INSERT INTO tipos_alerta (codigo, nombre) VALUES
    ('medica',   'Emergencia medica'),
    ('robo',     'Robo o intrusion'),
    ('incendio', 'Incendio'),
    ('otro',     'Otra emergencia');

INSERT INTO tipos_incidencia (nombre, nivel_urgencia) VALUES
    ('Robo',                    'critico'),
    ('Dano a propiedad',        'medio'),
    ('Comportamiento sospechoso','alto'),
    ('Emergencia medica',       'critico'),
    ('Disturbio / ruido',       'bajo'),
    ('Otro',                    'medio');

INSERT INTO planes_servicio (codigo, nombre, descripcion, precio_mensual, max_viviendas, max_guardias, incluye_camaras, incluye_trancas) VALUES
    ('esencial', 'VIGIA Esencial', 'Visitas, accesos, incidencias y comunidad', 2500.00, 100, 5, FALSE, FALSE),
    ('seguro',   'VIGIA Seguro',   'Incluye control de garita, vetos, turnos e integraciones basicas', 5500.00, 300, 15, TRUE, FALSE),
    ('integral', 'VIGIA Integral', 'Operacion multiacceso, camaras, trancas y soporte prioritario', 9500.00, NULL, NULL, TRUE, TRUE);

INSERT INTO configuraciones_residencial (residencial_id, zona_horaria)
SELECT id, COALESCE(zona_horaria, 'America/Tegucigalpa') FROM residenciales;


-- =====================================================================
-- Fin del script
-- =====================================================================
