# VIGIA — Revisión de Hilary (24 sep, ronda "CORREGIDO-4")

Revisé el zip completo (`VIGIA-main (3)-CORREGIDO-4.zip`) contra el código que ya
está en GitHub (con todo lo subido ayer/hoy). Extraje solo los **21 archivos
que de verdad cambiaron** — el resto del zip es idéntico a lo que ya tienen.
Verifiqué cada cambio uno por uno (no solo confié en su resumen en PDF),
revisé sintaxis, hice arrancar el servidor completo en un clon limpio con
estos archivos encima, y until ahí no encontré ningún problema. Todo lo de
abajo está listo para subir.

## No requiere ningún paso en la base de datos

Ninguno de estos 21 archivos toca la base de datos. Solo se sube el código.

## Qué cambia, por tema

**Incidencias**
- El formulario de reporte ya no se cierra si tocas fuera de él por
  accidente (antes perdías todo lo escrito).
- Puedes quitar la foto que adjuntaste antes de enviar el reporte.
- La evidencia fotográfica de una incidencia ahora se puede tocar para
  verla en grande.

**Visitas y calendario**
- El Dashboard ahora calcula la **próxima** fecha real de una visita
  recurrente (diaria, semanal o mensual) en vez de mostrar la fecha en que
  se creó la recurrencia — esto corrige la fecha vieja/incorrecta que
  vieron en las capturas.
- Se agregó soporte para recurrencia **diaria** (antes solo semanal/mensual
  se reconocía).
- Ajustes de calendario en móvil para que use mejor el ancho de pantalla.

**Mis accesos y diseño móvil**
- Se arregló el desbordamiento horizontal en teléfonos.
- Los campos de contraseña del registro quedan alineados.

**Registro — la lista de residenciales ahora es real**
- Antes el selector "Colonia / Residencial" del registro tenía una sola
  opción fija escrita a mano (`Altavista Residencial`). Se agregó un
  endpoint público nuevo (`GET /api/auth/residenciales-publicas`, sin
  necesidad de sesión, porque el registro es antes de iniciar sesión) que
  devuelve solo el nombre de las residenciales activas, y el formulario
  ahora las carga de ahí.

**Mensajería**
- La bandeja del guardia hacía hasta 3-4 consultas a la base de datos por
  cada conversación (con 50 hilos, cientos de consultas) — por eso tardaba
  en cargar. Se reescribió para traer todo en lotes; debería sentirse
  notablemente más rápido.
- En móvil, al abrir una conversación aparece un botón "Volver" para
  regresar a la lista.

**Vetos — corrigió un bug real que ya existía**
- El formulario de Vetos tenía el campo de evidencia con el id `vePhoto`
  en el HTML, pero el JS buscaba `veEvidence` — es decir, **subir una foto
  de evidencia en una solicitud de veto nunca había funcionado**. Ahora
  coinciden los ids y sí funciona. También el contador de caracteres del
  motivo ahora bloquea de verdad pasar de 255 (antes solo avisaba).

**Perfil**
- Los contadores de estadísticas (visitas, accesos, etc.) solo aplican a
  residentes — ahora se ocultan completamente para guardia/admin en vez de
  dejar un espacio vacío sin datos.

**Notificaciones**
- "Marcar todo como leído" llamaba a una ruta que no existe en el backend
  (`/notificaciones/marcar-todas`) — por eso no hacía nada. Se cambió para
  marcar cada notificación individualmente con la ruta que sí existe.

**Modo claro y accesibilidad**
- El botón flotante amarillo de lectura/altavoz que tapaba el menú lateral
  se quitó — la función de lectura sigue disponible desde Configuración.
- Corregidos botones y tarjetas del panel de guardia que en modo claro se
  veían con colores de modo oscuro.
- Los formularios/modales ahora ocultan el botón flotante del asistente
  mientras están abiertos, para que no se sobreponga.

**Teléfonos**
- Los números de Honduras ahora se limitan de verdad a 8 dígitos (antes se
  podía escribir más).

## Un archivo de backend nuevo, revisado con cuidado

`src/routes/auth.js` agrega una sola ruta pública nueva:
`GET /api/auth/residenciales-publicas`, que solo devuelve `id` y `nombre`
de las residenciales activas — no expone nada sensible, y es necesaria
para que el registro funcione (ver arriba). No toca login ni ninguna otra
ruta existente.

## Verificación hecha antes de entregar

- Comparé el zip completo contra un clon limpio de GitHub — de los ~220
  archivos, solo 21 cambiaron de verdad.
- `node --check` en los 14 `.js` tocados: sin errores.
- Balance de `<div>`/`</div>` en los 6 HTML tocados: correcto.
- Clon limpio del repo + estos 21 archivos encima (igual a como los suben
  ustedes) + `npm install` + arranque completo del servidor: sin errores.
- Confirmé que el fix de esta mañana en `incidencias-gestion.js` (botones
  rápidos para resolver/cerrar) sigue intacto — Hilary trabajó encima de
  la versión más reciente, no de una vieja.

## Cómo subir esto

Sube estos 21 archivos a GitHub respetando las mismas rutas — todos
sobrescriben archivos que ya existen:

`public/css/style.css`, `public/dashboard.html`, `public/emergencias.html`,
`public/incidencias.html`, `public/mensajeria.html`, `public/register.html`,
`public/vetos.html`, `public/js/common.js`, `public/js/comunidad.js`,
`public/js/emergencias.js`, `public/js/incidencias-gestion.js`,
`public/js/incidencias.js`, `public/js/mensajeria.js`,
`public/js/notificaciones.js`, `public/js/operaciones.js`,
`public/js/perfil.js`, `public/js/register.js`, `public/js/vetos.js`,
`public/js/visitas.js`, `src/routes/auth.js`,
`src/routes/overrides/mensajes.js`.

No hace falta correr nada en la base de datos.
