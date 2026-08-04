# Matriz de cambios por retroalimentación

| Observación recibida | Solución incorporada | Archivos o módulos principales |
|---|---|---|
| Manejar tiempo de acceso y filas | Cola con hora de llegada, inicio, fin, promedio, objetivo y alerta por cantidad. | `cola_acceso`, `control-acceso.html`, `colaAcceso.js` |
| Registro demasiado largo | Formulario corto, fotografía, documento o QR y campos mínimos. | `control-acceso.html` |
| Evidencia del guardia | Fotografía obligatoria vinculada al guardia y turno. | `evidencias_acceso`, `colaAcceso.js` |
| Registrar con fotografía | Captura móvil y compresión antes de guardar. | `control-acceso.js` |
| Diseño, colores y letra | Temas, paletas, contraste, fuentes adaptables y responsive. | `config.html`, `config.js`, `style.css` |
| Integrar sistemas de colonias | Catálogo de integraciones, modos, configuración y eventos. | `integraciones`, `eventos_integracion`, `integraciones.html` |
| Venta del servicio | Planes, suscripciones, prueba, precio, ciclo y estado. | `planes_servicio`, `suscripciones`, `suscripciones.html` |
| Buses escolares y autorizados | Autorizaciones recurrentes con días, horas, placa, empresa y fotografía. | `personas_autorizadas`, `autorizados.html` |
| Veto y personas autorizadas por otros | Solicitud de veto, aprobación administrativa y conflicto bloqueante. | `vetos_acceso`, `conflictos_permisos`, `conflictos.html` |
| Falta de luz o internet | PWA, caché de interfaz, cola offline e idempotencia. | `sw.js`, `common.js`, `acciones_offline` |
| Robo de dispositivo | JWT expirable, sesiones revocables y dispositivos confiables. | `sesiones`, `dispositivos_usuario`, `seguridad.html` |
| Huella o rostro | Detección WebAuthn y preferencia preparada; autenticación biométrica completa documentada como siguiente integración. | `seguridad.js`, `dispositivos_usuario` |
| Trancas y cámaras | Adaptadores configurables y simulador; conexión real depende del proveedor. | `integraciones.html`, `integraciones.js` |
| Sistemas similares | Benchmark de Verkada Guest, ButterflyMX y Kisi. | `benchmark.html` |
| Accesibilidad | Escala de grises, filtros de daltonismo, contraste, texto grande, modo simple, voz y menos movimiento. | `config.html`, `config.js` |
| Usuarios y roles | RBAC, permisos, creación segura y perfiles por rol. | `roles`, `permisos`, `usuarios.js`, `superadmin.html` |
| Reporte de incidencias | Evidencia, visibilidad, límites, propiedad y flujo de estado. | `incidencias.js`, `incidencias.html` |
| Superadministrador | Clientes, colonias, usuarios, planes y suscripciones. | `superadmin.html`, `suscripciones.html` |
| Comunicación interna | Comunidad pública/privada y chat persistente con personal. | `publicaciones_comunidad`, `mensajes`, `mensajeria.html` |
| Chatbot o filtro automático | Asistente local y moderación por reglas sin enviar datos a terceros. | `common.js`, `mensajes.js`, `moderacion_mensajes` |
| Contactos de emergencia | Directorio público y contactos privados del residente. | `contactos_emergencia`, `emergencias.html` |
| Limitar Enter y contenido | Máximo de líneas, caracteres, enlaces y repetición. | `incidencias.js`, `comunidad.js`, `mensajes.js` |
| Cambio de horario y guardias | Zona horaria IANA, jornadas y relevos. | `configuraciones_residencial`, `turnos_guardia` |
| Guardar guardia original | Campos de guardia original y actual, incluso con relevo. | `cola_acceso`, `accesos`, `turnos_guardia` |
| Solo mis incidencias | Filtro obligatorio por residente en backend. | `incidencias.js` |
| No cerrar incidencias innecesariamente | Residente sin acción de cierre; administración controla estados. | `incidencias.js` |
| Bloquear F12 | Disuasión visual de atajos, aclarando que no sustituye seguridad del servidor. | `common.js`, `README.md` |
