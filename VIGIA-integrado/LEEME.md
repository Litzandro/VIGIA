# VIGIA — Aumento de precio de planes (+45%)

## ⚠️ Paso en la base de datos (obligatorio)

Suban el código a GitHub y luego corran, contra la base de datos de
Railway, el archivo:

**`database/11_subir_precios_planes_45.sql`**

Es seguro correrlo más de una vez.

## Qué cambió

Se subió un 45% el precio de lista de los 3 planes:

| Plan | Precio anterior | Precio nuevo |
|---|---|---|
| VIGIA Esencial | L 2,500.00 | **L 3,625.00** |
| VIGIA Seguro | L 5,500.00 | **L 7,975.00** |
| VIGIA Integral | L 9,500.00 | **L 13,775.00** |

Todos los precios que se muestran en la app (Suscripciones, Mi
suscripción) salen en vivo de la base de datos — no hay ningún precio
escrito a mano en el código, así que no hace falta tocar ninguna
pantalla. Con solo correr la migración, el precio nuevo aparece en todos
lados automáticamente.

## Importante: esto NO les sube el precio a los clientes que ya están activos

El precio nuevo aplica automáticamente a cualquier residencial que se
suscriba de ahora en adelante. Pero los que ya están pagando hoy tienen
su propio precio guardado aparte (`precio_acordado`, fijado el día que se
suscribieron) — ese no cambia solo. Si también quieren subírselo a los
clientes actuales, dejé el `UPDATE` listo (comentado) al final del mismo
archivo SQL, para correrlo aparte cuando lo decidan — normalmente
conviene avisarles antes con tiempo.

## Verificación hecha antes de entregar

- Clon limpio del repo de GitHub + estos archivos encima (igual a como
  los suben ustedes) + `npm install` + arranque completo del servidor:
  sin errores.

## Archivos

- `database/vigia_schema.sql` — precio de fábrica actualizado (para
  instalaciones nuevas desde cero).
- `database/02_retroalimentacion_vigia.sql` — mismo ajuste, en el
  segundo script que también define los planes.
- `database/11_subir_precios_planes_45.sql` (nuevo) — la migración para
  aplicar el cambio a la base de datos que ya está corriendo en Railway.
