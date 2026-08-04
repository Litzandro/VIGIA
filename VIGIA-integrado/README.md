# VIGIA 2.0 — control de accesos, visitas e incidencias

VIGIA es una aplicación web para residenciales y colonias privadas. Esta versión integra en un solo proyecto:

- Frontend responsive en `public/`.
- Backend Node.js, Express y Sequelize en `src/`.
- Base de datos MySQL con 48 tablas en `database/vigia_schema.sql`.
- Autenticación con JWT, sesiones revocables y permisos por rol.
- Modo sin conexión para escrituras pendientes y sincronización posterior.
- Portal de residente, guardia, administrador y superadministrador.

## Módulos incorporados por la retroalimentación

### Operación de garita

- **Control de acceso rápido:** registro corto por fotografía, documento o QR.
- **Evidencia obligatoria:** la fotografía queda vinculada al guardia y al turno.
- **Cola y tiempo de atención:** registra llegada, inicio y finalización, calcula el promedio y alerta por acumulación.
- **Turnos y relevos:** conserva al guardia original aunque otro termine el proceso.
- **Personas autorizadas:** buses escolares, familiares, transporte, servicio doméstico y proveedores, con días y horarios.
- **Vetos y conflictos:** un guardia no puede ignorar un veto; administración debe resolver autorizaciones contradictorias.

### Incidencias y comunicación

- El residente solo consulta sus propias incidencias.
- El residente no puede cerrar una incidencia; la gestión corresponde al personal autorizado.
- Los guardias deben adjuntar evidencia cuando la configuración de la residencial lo exige.
- Publicaciones para toda la residencial, por torre o privadas para administración.
- Mensajería persistente entre residentes y seguridad, con reglas automáticas contra spam y resaltado de posibles emergencias.
- Asistente local de ayuda dentro de la interfaz. No envía conversaciones a una IA externa.
- Directorio de contactos de emergencia públicos y contactos privados del residente.

### Seguridad y continuidad

- JWT con expiración configurable.
- Sesiones guardadas en la base de datos, cierre de sesión y revocación por dispositivo.
- Pantalla de dispositivos confiables y detección de disponibilidad de WebAuthn/biometría.
- Cola offline idempotente: evita duplicar una misma operación al sincronizar.
- Service worker y manifiesto para una experiencia instalable y recuperación de la interfaz sin conexión.
- Registro en bitácora de operaciones de escritura.

### Accesibilidad y experiencia móvil

- Vista adaptable a teléfonos, tabletas y computadoras.
- Temas claro, suave, oscuro y alto contraste.
- Escala de grises y filtros para deuteranopia, protanopia y tritanopia.
- Texto normal, grande y extra grande.
- Modo simple, reducción de movimiento y lectura de la página con síntesis de voz del navegador.
- Formularios con límites de caracteres y líneas para evitar procesos largos.

### Administración y modelo comercial

- Superadministrador para crear residenciales, administradores, guardias y residentes.
- Planes, precios, ciclos de cobro, pruebas, suspensión y renovación de suscripciones.
- Configuración por residencial: tiempo objetivo, límite de cola, zona horaria, evidencia y modo offline.
- Catálogo de integraciones para trancas, cámaras, sistemas existentes, webhooks e IA externa.
- Simulador de integraciones y bitácora de eventos de prueba.
- Página de benchmark con referencias funcionales del mercado.

## Roles principales

| Rol | Responsabilidades principales |
|---|---|
| Residente | Programar visitas, registrar autorizados, solicitar vetos, reportar incidencias, usar comunidad, chat y emergencias. |
| Guardia | Registrar accesos con evidencia, gestionar cola, reportar incidencias, atender alertas, revisar mensajes y turnos. |
| Administrador | Gestionar usuarios de su residencial, resolver vetos/conflictos, turnos, configuración e integraciones. |
| Superadministrador | Gestionar clientes, residenciales, planes, suscripciones y cuentas globales. |

## Instalación rápida

### Instalación nueva

1. Ejecuta `database/vigia_schema.sql` completo en MySQL Workbench.
2. Copia `.env.example` como `.env` y configura MySQL y `JWT_SECRET`.
3. Ejecuta:

```bash
npm install
npm run seed:demo
npm run dev
```

4. Abre `http://localhost:3000`.

### Actualización de la versión anterior

1. Haz una copia de seguridad de la base `vigia`.
2. Ejecuta **una sola vez** `database/02_retroalimentacion_vigia.sql`.
3. Reemplaza el código anterior por esta versión.
4. Ejecuta:

```bash
npm install
npm run seed:demo
npm run dev
```

No ejecutes la migración dos veces porque contiene instrucciones `ALTER TABLE` y creación de tablas.

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Residente | `jorge.paz@correo.com` | `vigia123` |
| Guardia | `jorge.reyes@vigia.com` | `vigia123` |
| Administrador | `admin@vigia.test` | `Vigia2026!` |
| Superadministrador | `superadmin@vigia.test` | `Vigia2026!` |

Cambia estas contraseñas antes de publicar el sistema.

## Rutas principales del frontend

| Página | Uso |
|---|---|
| `dashboard.html` | Panel del residente. |
| `autorizados.html` | Personas y servicios recurrentes. |
| `vetos.html` | Solicitudes de veto. |
| `incidencias.html` | Reporte y seguimiento de incidencias. |
| `chat.html` | Comunicación del residente con seguridad. |
| `emergencias.html` | Contactos de emergencia. |
| `seguridad.html` | Sesiones y dispositivos. |
| `control-acceso.html` | Cola y registro rápido en garita. |
| `mensajeria.html` | Bandeja de mensajes del personal. |
| `conflictos.html` | Vetos y conflictos de permisos. |
| `operaciones.html` | Turnos, relevos y métricas. |
| `integraciones.html` | Cámaras, trancas y sistemas externos. |
| `superadmin.html` | Usuarios, roles y residenciales. |
| `suscripciones.html` | Planes y clientes. |
| `benchmark.html` | Comparación funcional de mercado. |

## API y estructura

Cada tabla tiene un endpoint REST en `/api/<recurso>`. Las rutas con reglas especiales se encuentran en `src/routes/overrides/`, por ejemplo:

- `colaAcceso.js`: cola, tiempos, evidencia y veto automático.
- `incidencias.js`: propiedad, evidencia, visibilidad y estados.
- `mensajes.js`: participantes, bandeja y moderación local.
- `turnosGuardia.js`: inicio, relevo y finalización de jornadas.
- `usuarios.js`: creación segura de cuentas y perfiles.
- `integraciones.js`: pruebas controladas sin ejecutar endpoints arbitrarios.

`GET /api/health` verifica el servidor y la conexión a MySQL.

## Referentes de mercado investigados

La comparación funcional se basó en documentación oficial de:

- Verkada Guest: gestión de visitantes, listas de denegación e integración con video/control de acceso.
- ButterflyMX: acceso móvil, pases de visitantes y control de puertas o portones.
- Kisi: registro de visitantes mediante QR, credenciales digitales y APIs de integración.

Estas referencias sirven como benchmark. VIGIA no contiene código ni interfaces copiadas de esos productos.

## Limitaciones honestas de esta versión

- **Trancas y cámaras:** existe el catálogo, simulador, configuración y bitácora; todavía se necesita el SDK/API y el hardware específico de cada proveedor para operar equipos reales.
- **Biometría:** se detecta soporte de WebAuthn y se administran dispositivos confiables, pero falta implementar el desafío criptográfico completo y almacenar credenciales públicas para iniciar sesión con huella o rostro.
- **IA externa:** la moderación y el asistente actuales usan reglas locales. El módulo de integraciones deja el punto preparado para un proveedor de IA, pero no envía datos fuera de VIGIA.
- **F12:** se bloquean algunos atajos como medida visual, pero esto no es seguridad real. La protección efectiva está en autenticación, autorización, validación del backend, Helmet, bitácora y aislamiento por residencial.
- **Fotografías:** para la demostración se guardan comprimidas en `MEDIUMTEXT`. En producción conviene usar almacenamiento de objetos y guardar solo la URL en MySQL.
- **Tiempo real:** la mensajería usa consultas periódicas. Para notificaciones instantáneas a gran escala conviene agregar WebSocket o un servicio push.

## Validación incluida

- Sintaxis comprobada en los archivos JavaScript del backend, scripts y frontend.
- `npm run test:offline` ejecuta 41 pruebas sobre CRUD, paginación, scoping, roles, llaves compuestas, permisos y validación de invitaciones.
- Referencias locales de HTML, CSS y JavaScript verificadas.

La prueba completa con tu servidor MySQL debe ejecutarse en tu computadora mediante `npm run dev` y `http://localhost:3000/api/health`.
