
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

-- Extensiones de trazabilidad en tablas existentes.
ALTER TABLE accesos
    ADD COLUMN turno_guardia_id BIGINT UNSIGNED NULL AFTER guardia_id,
    ADD COLUMN guardia_original_nombre VARCHAR(180) NULL AFTER turno_guardia_id,
    ADD COLUMN duracion_proceso_seg INT UNSIGNED NULL AFTER fecha_hora,
    ADD COLUMN modo_registro ENUM('qr','foto','documento','manual','offline','integracion') NOT NULL DEFAULT 'manual' AFTER duracion_proceso_seg,
    ADD CONSTRAINT fk_acc_turno FOREIGN KEY (turno_guardia_id) REFERENCES turnos_guardia(id) ON DELETE SET NULL;

ALTER TABLE incidencias
    ADD COLUMN visibilidad ENUM('privada','administracion','comunidad') NOT NULL DEFAULT 'privada' AFTER descripcion,
    ADD COLUMN guardia_original_nombre VARCHAR(180) NULL AFTER asignado_a,
    ADD COLUMN cerrada_por BIGINT UNSIGNED NULL AFTER fecha_resolucion,
    ADD CONSTRAINT fk_inc_cerrada_por FOREIGN KEY (cerrada_por) REFERENCES usuarios(id) ON DELETE SET NULL;


ALTER TABLE incidencias_evidencias MODIFY COLUMN url_archivo MEDIUMTEXT NULL;
ALTER TABLE personas_autorizadas MODIFY COLUMN foto_url MEDIUMTEXT NULL;
ALTER TABLE vetos_acceso MODIFY COLUMN evidencia_url MEDIUMTEXT NULL;
ALTER TABLE cola_acceso MODIFY COLUMN foto_url MEDIUMTEXT NULL;
ALTER TABLE evidencias_acceso MODIFY COLUMN url_archivo MEDIUMTEXT NOT NULL;

-- Permisos y datos iniciales requeridos por los nuevos módulos.
INSERT IGNORE INTO permisos (codigo, modulo, descripcion) VALUES
    ('autorizados.gestionar',    'autorizados',  'Gestionar personas y servicios con acceso recurrente'),
    ('vetos.solicitar',          'vetos',        'Solicitar el veto de una persona para la vivienda'),
    ('vetos.consultar',          'vetos',        'Consultar alertas de veto en garita'),
    ('vetos.gestionar',          'vetos',        'Aprobar, revocar y resolver vetos o conflictos'),
    ('cola.gestionar',           'cola',         'Gestionar la cola y el registro rápido de garita'),
    ('turnos.consultar',         'turnos',       'Consultar el turno y los relevos de guardia'),
    ('turnos.gestionar',         'turnos',       'Programar jornadas y relevos de guardias'),
    ('integraciones.gestionar',  'integraciones','Configurar trancas, cámaras, webhooks y sistemas externos'),
    ('suscripciones.gestionar',  'suscripciones','Gestionar planes, clientes y suscripciones'),
    ('emergencias.consultar',    'emergencias',  'Consultar el directorio de contactos de emergencia'),
    ('emergencias.gestionar',    'emergencias',  'Gestionar contactos de emergencia'),
    ('comunidad.publicar',       'comunidad',    'Crear publicaciones comunitarias o privadas'),
    ('offline.sincronizar',      'offline',      'Sincronizar acciones creadas sin conexión');

INSERT IGNORE INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.codigo='superadmin';

INSERT IGNORE INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo='admin' AND p.codigo IN
('autorizados.gestionar','vetos.consultar','vetos.gestionar','cola.gestionar','turnos.consultar','turnos.gestionar','integraciones.gestionar','emergencias.consultar','emergencias.gestionar','comunidad.publicar','offline.sincronizar');

INSERT IGNORE INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo='guardia' AND p.codigo IN
('vetos.consultar','cola.gestionar','turnos.consultar','emergencias.consultar','offline.sincronizar');

INSERT IGNORE INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo='residente' AND p.codigo IN
('autorizados.gestionar','vetos.solicitar','emergencias.consultar','comunidad.publicar','offline.sincronizar');

INSERT IGNORE INTO planes_servicio (codigo, nombre, descripcion, precio_mensual, max_viviendas, max_guardias, incluye_camaras, incluye_trancas) VALUES
    ('esencial', 'VIGIA Esencial', 'Visitas, accesos, incidencias y comunidad', 2500.00, 100, 5, FALSE, FALSE),
    ('seguro',   'VIGIA Seguro',   'Control de garita, vetos, turnos e integraciones básicas', 5500.00, 300, 15, TRUE, FALSE),
    ('integral', 'VIGIA Integral', 'Operación multiacceso, cámaras, trancas y soporte prioritario', 9500.00, NULL, NULL, TRUE, TRUE);

INSERT IGNORE INTO configuraciones_residencial (residencial_id, zona_horaria)
SELECT id, COALESCE(zona_horaria, 'America/Tegucigalpa') FROM residenciales;
