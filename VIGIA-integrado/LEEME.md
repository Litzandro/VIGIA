# VIGIA — Botones rápidos para atender incidencias (sin base de datos)

## Qué cambió

Antes, para pasar un caso de "En progreso" a resuelto y después a cerrado
había que entrar al detalle dos veces por separado — un clic para abrir,
otro para "Marcar resuelta"; luego otra vez entrar, otro clic para "Cerrar
incidencia". Lo mismo para cada uno de los 55 casos de la lista, sin
importar qué tan urgente fuera.

Ahora, para las incidencias que **no son urgentes**, aparecen botones
directos en la propia tarjeta de la lista (igual que ya existía el botón
"Tomar caso" para las recién reportadas):

- **En progreso** → botón "Marcar resuelta" ahí mismo, un clic.
- **Resuelta** → botón "Cerrar" ahí mismo, un clic.

Las incidencias **urgentes siguen exactamente igual que antes** — hay que
entrar al detalle para resolverlas y cerrarlas. Fue intencional: en esas sí
tiene sentido dejar una nota de cómo se resolvió antes de cerrarlas, y así
lo diste a entender ("en las urgentes te lo entiendo").

No hace falta ningún paso en la base de datos — el comentario/nota siempre
fue opcional en el servidor, solo hacía falta un lugar más corto para
usarlo sin escribir nada.

## Archivo modificado

- `public/js/incidencias-gestion.js`

## Verificación hecha antes de entregar

- `node --check`: sin errores.
- Clon limpio del repo de GitHub + este archivo encima (igual a como lo
  suben ustedes) + `npm install` + arranque completo del servidor: sin
  errores.

## Cómo subir esto

Sube `public/js/incidencias-gestion.js` a GitHub, sobrescribiendo el que ya
existe en esa misma ruta. Nada más.
