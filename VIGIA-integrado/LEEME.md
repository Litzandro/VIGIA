# VIGIA — Plantillas de turno (recurrentes y rotativos) + historial

## 🐛 v2: se corrigió "la página no responde" al abrir cualquier modal

Reportaste que la app se trababa al presionar "Nueva plantilla" — y al
confirmarme que "Relevar" (que ya existía antes de este paquete) también
se trababa, quedó claro que era un bug de la app en general, no algo que
rompiera mi entrega de hoy. Lo encontré y corregí en `public/js/common.js`
(el asistente flotante "VIGIA" de la esquina inferior derecha vigilaba
*toda* la página entera para saber cuándo ocultarse mientras hay un modal
abierto — cualquier cambio de clase en cualquier botón, insignia o filtro
de toda la app volvía a disparar esa vigilancia, y bajo cierta combinación
de acciones eso podía trabar la pestaña de forma indefinida). Ya solo
vigila los propios modales, no toda la página; el comportamiento visual
no cambia. **`common.js` va incluido en este paquete v2** — solo hace
falta volver a subir ese archivo (aunque ya hayas subido el resto).

## ⚠️ Paso obligatorio en la base de datos

Después de subir el código a GitHub, corran **una sola vez** contra la
base de datos de Railway:

**`database/12_plantillas_turno.sql`**

Crea 2 tablas nuevas (`plantillas_turno`, `plantilla_turno_guardias`) y
agrega una columna nueva a `turnos_guardia` (`plantilla_id`). Es seguro
correrlo más de una vez — si ya existe algo, lo detecta y no hace nada.

## Qué resuelve

Dijiste: *"debe de haber una forma más fácil... estar metiendo cada vez
otra vez el guardia cada vez que quiero que tome un turno es ineficiente
y ilógico"*. Antes, cada jornada en "Programar jornada" era una fila
100% manual e independiente — no existía ningún concepto de turno que se
repite.

Ahora, en **Operación de garita**, hay un panel nuevo "Plantillas de
turno" donde el admin arma el patrón una sola vez:

- **Nombre** (ej. "Garita principal — diurno")
- **Punto de acceso**, **hora de inicio/fin**
- **Días de la semana** en que aplica
- **Uno o varios guardias**: con uno solo, el turno siempre es de esa
  persona; con varios, el sistema los va **rotando automáticamente** en
  el orden que armes (round-robin — le toca al primero, después al
  segundo, y así sucesivamente cada vez que se genera un turno nuevo).

Desde ahí se puede **editar**, **pausar/reactivar** o **eliminar** una
plantilla (eliminarla no borra los turnos que ya generó — quedan en el
historial).

## Cómo se generan los turnos (sin necesidad de un servidor programado)

VIGIA no tiene ningún proceso corriendo en segundo plano (cron) en
Railway, así que en vez de eso: cada vez que alguien abre "Operación de
garita", el sistema revisa las plantillas activas de esa residencial y
genera los turnos que falten — el de hoy, y cualquier día atrasado hasta
7 días atrás (por si nadie abrió la pantalla en unos días, no se pierde
la rotación). Esto es consistente con cómo ya funciona el resto de la
app (nada usa cron; todo se calcula al momento).

**Importante para que esto funcione de verdad:** alguien tiene que abrir
la pantalla "Operación de garita" ese día para que el turno del día se
genere. Si nadie la abre nunca, no se genera nada — pero en cuanto
alguien entra, se pone al día automáticamente.

## Turnos que nadie inicia — ahora quedan en el historial como "ausente"

Como pediste, si un turno programado pasa **30 minutos** de su hora de
inicio sin que el guardia pulse "Iniciar", pasa solo a estado
**"ausente"** y queda visible ahí, en vez de quedarse "programado" para
siempre sin que nadie sepa qué pasó. Administración puede reasignarlo
con el botón "Relevar" igual que cualquier otro turno.

## Historial: hora real vs. programada, integrado en la vista actual

Cada tarjeta de "Jornadas y relevos" ahora muestra, cuando aplica:

- **"Real: — — —"**: la hora real en que el guardia pulsó
  "Iniciar"/"Finalizar" (esto ya existía en la base de datos —
  `inicio_real`/`fin_real` — pero nunca se mostraba en pantalla).
- **Insignia "Llegó tarde"**: si empezó más de 15 minutos después de lo
  programado.
- **Insignia con el nombre de la plantilla**: para saber que ese turno
  se generó solo, no que alguien lo programó a mano ese día.

No se creó una pantalla aparte — se integró todo en la lista que ya
usan, como pediste.

## Turnos nocturnos (que cruzan medianoche)

Si la hora de fin de la plantilla es menor que la de inicio (ej. 10pm a
6am), el sistema entiende que termina al día siguiente y calcula el
turno correctamente.

## Archivos nuevos o modificados

- `database/vigia_schema.sql` — esquema actualizado (instalaciones nuevas).
- `database/12_plantillas_turno.sql` (nuevo) — migración para Railway.
- `scripts/generate-models.js` — se le agregó soporte para columnas tipo
  `TIME` (no lo tenía; hacía falta para `hora_inicio`/`hora_fin`).
- `src/models/PlantillasTurno.js`, `src/models/PlantillaTurnoGuardias.js`
  (nuevos, generados automáticamente) y `src/models/TurnosGuardia.js`
  (columna `plantilla_id` agregada) + `src/models/_associations.json`.
- `src/routes/index.js` — registra la ruta nueva `/api/plantillas-turno`
  y oculta `plantilla_turno_guardias` como recurso directo (se maneja
  solo desde adentro de plantillas-turno).
- `src/config/resourcePermissions.js` — permisos de la ruta nueva
  (reutiliza `turnos.gestionar`/`turnos.consultar`, que ya existían).
- `src/routes/overrides/plantillasTurno.js` (nuevo) — crear/editar/
  pausar/eliminar plantillas.
- `src/routes/overrides/turnosGuardia.js` — genera turnos desde
  plantillas activas, marca ausentes, y decora cada turno con
  `llego_tarde`/`plantilla_nombre`.
- `public/operaciones.html` y `public/js/operaciones.js` — panel de
  plantillas, modal de creación/edición con rotación de guardias, y
  tarjetas de jornada mejoradas.
- `public/css/style.css` — estilos del modal de plantilla.
- `public/js/common.js` (v2) — corrige el "página no responde" al abrir
  cualquier modal (ver arriba). Este archivo es compartido por *toda* la
  app (todas las páginas lo cargan), así que arregla el problema en
  todos lados, no solo en Operación de garita.

**Nota:** `public/operaciones.html`, `public/js/operaciones.js`,
`public/css/style.css` y `public/js/common.js` de este paquete ya
incluyen los cambios de la revisión de Hilary de esta mañana
(`vigia-revision-hilary-2.zip`) — no importa en qué orden suban los dos
paquetes, el resultado final es el mismo.

## Verificación hecha antes de entregar

- `node --check` en los 9 `.js` tocados/nuevos: sin errores.
- Balance de `<div>`/`</div>` en `operaciones.html`: correcto (55/55).
- Probé este paquete dos veces sobre un clon limpio de GitHub: una vez
  solo (sin la revisión de Hilary) y otra junto con ella — en ambos
  casos `npm install` + arranque completo del servidor sin errores.
- Repasé a mano la lógica de rotación (a quién le toca después) y el
  cálculo de turnos que cruzan medianoche.
- No pude probar el `.sql` de la migración contra un MySQL real (mi
  entorno de pruebas no tiene motor de base de datos disponible) — el
  patrón que usa (chequear en `information_schema` antes de cada cambio)
  es el mismo que ya usamos en las migraciones anteriores que sí
  funcionaron en Railway. Si algo da un error al correrlo, mándame el
  mensaje exacto y lo resolvemos igual que las veces anteriores.

## Cómo subir esto

1. Sube los 15 archivos listados arriba a GitHub (mismas rutas,
   sobrescriben donde ya existen — no te olvides de `public/js/common.js`).
2. Corre `database/12_plantillas_turno.sql` contra la base de datos de
   Railway (paso ⚠️ de arriba).
3. Prueba de nuevo el botón "Nueva plantilla" y "Relevar" para confirmar
   que ya no se traban.
