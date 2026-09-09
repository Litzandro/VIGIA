# Checklist de pruebas — VIGIA

Guía de casos que un tester (o cualquiera del equipo) debería intentar a
propósito para encontrar bugs reales, no solo confirmar que "funciona
cuando se usa bien". La mayoría de bugs de producción no vienen de que
alguien use la app normal — vienen de alguien escribiendo algo que nadie
anticipó.

Esta lista se organiza por tipo de error, con ejemplos concretos de
dónde probarlo en VIGIA específicamente.

---

## 1. Números donde van letras, y letras donde van números

Ya se corrigió que esto se bloquee en tiempo real (no solo al enviar) en
los campos de nombre y teléfono de toda la app, y se agregó una segunda
capa de validación en el backend (`src/config/resourceValidation.js`)
para que no baste con editar el HTML o usar la API directamente para
saltárselo. Aun así, hay que probar:

- [ ] Escribir números en un campo de nombre (`Ana123`, `123456`) — en
      **Nueva visita**, **Registro de cuenta**, **Autorizados**,
      **Emergencias**, **Vetos**, **Personal (superadmin)**. Debe
      bloquearse mientras se escribe, no solo al enviar.
- [ ] Escribir letras en un campo de teléfono (`abcd-1234`, `telefono`)
      en esos mismos formularios.
- [ ] Pegar (Ctrl+V) un número o texto largo directo en el campo, en vez
      de escribirlo letra por letra — algunos filtros solo reaccionan
      bien a tipeo real y pueden comportarse distinto con pegado masivo.
- [ ] Probar acentos y nombres compuestos reales: `María José`,
      `O'Brien`, `Ana-Sofía`, `José María de la Cruz` — estos SÍ deben
      pasar, no deben bloquearse por error.
- [ ] En **Autorizados** y **Acceso rápido** (guardia): escribir una
      placa con símbolos raros (`HAA@@1234!!`) — debe rechazarse o
      limpiarse.

## 2. Cantidades y números fuera de rango

- [ ] En **Autorizados**: poner "máximo de accesos por día" en `0`,
      negativo (`-5`), decimal (`2.5`), o un número absurdo (`99999`).
- [ ] En **Nueva visita** (si el formulario expone "usos máximos" del
      código QR): mismo tipo de prueba.
- [ ] En cualquier campo de fecha: poner una fecha "hasta" **anterior**
      a la fecha "desde".
- [ ] En horarios (Autorizados, con franja horaria): poner "hora hasta"
      antes que "hora desde" (ej. desde 6:00 PM hasta 6:00 AM sin que
      sea overnight explícito).

## 3. Textos demasiado largos (o vacíos)

- [ ] Dejar vacío cualquier campo marcado como obligatorio y enviar de
      todas formas (a veces el `required` de HTML se puede saltar
      enviando el formulario por otro medio, o si el JS falla).
- [ ] Escribir solo espacios en blanco (`"   "`) en un campo obligatorio
      — un campo así "parece" lleno pero no tiene contenido real.
- [ ] Pegar un párrafo de 5,000+ caracteres en un campo de nombre o
      teléfono (copiar un artículo de Wikipedia y pegarlo entero es una
      forma rápida de probar esto).
- [ ] En **Comunidad**: publicar un mensaje pegando el mismo carácter
      repetido muchísimas veces (`aaaaaaaaaa...` x200) — ya hay una
      regla que debería rechazar repeticiones excesivas.
- [ ] En **Incidencias**: probar el título/descripción justo en el
      límite (150/500 caracteres exactos) y uno arriba del límite.

## 4. Intentos de inyectar código (XSS)

- [ ] En cualquier campo de texto libre (nombre, motivo, descripción,
      notas, mensaje de Comunidad o Chat), escribir literalmente:
      `<script>alert(1)</script>` — el navegador **nunca** debe mostrar
      una alerta emergente al ver ese dato después (en la lista, en el
      detalle, en notificaciones). Si aparece la alerta, es un bug de
      seguridad real, no cosmético.
- [ ] Probar también con `<img src=x onerror=alert(1)>` y
      `"><svg onload=alert(1)>` — variantes comunes que a veces se
      cuelan aunque la primera sí se bloquee.

## 5. Doble clic y envíos duplicados

- [ ] Hacer doble clic rápido en "Guardar"/"Enviar" en cualquier
      formulario (Nueva visita, Reportar incidencia, Autorizados,
      Vetos, Emergencias) — debe quedar **un solo** registro, no dos.
- [ ] Con conexión lenta (Chrome DevTools → Network → "Slow 3G"),
      repetir la prueba anterior — con más margen de tiempo entre clic
      y respuesta, es más fácil alcanzar a hacer doble clic sin querer.
- [ ] Enviar el mismo formulario, cerrar la pestaña antes de que
      responda, y volver a abrir la página — confirmar que no quedó
      "a medias" ni duplicado.

## 6. Saltarse el rol / permisos por URL directa

- [ ] Iniciar sesión como **residente** y escribir directamente en la
      barra de direcciones la URL de una página de personal (ej.
      `guardia.html`, `superadmin.html`) — debe redirigir, no mostrar
      contenido de otro rol.
- [ ] Iniciar sesión como **guardia** e intentar entrar a
      `dashboard.html` (panel de residente) por URL directa.
- [ ] Con las herramientas de desarrollador (F12 → Network), copiar una
      petición a la API que hizo la app (clic derecho → Copy as cURL) y
      volver a mandarla cambiando el `id` de otro registro — confirmar
      que el backend rechaza ver/editar datos de otro residente o de
      otra residencial, no solo que el botón esté oculto en pantalla.

## 7. Casos raros de fecha y hora

- [ ] Agendar una visita para "ahora mismo" y para una fecha muy lejana
      (ej. dentro de 5 años) — confirmar que ambas se comportan bien.
- [ ] Probar el calendario de "Mis visitas" cruzando de un mes a otro,
      y especialmente cruzando de diciembre a enero (cambio de año).
- [ ] Cambiar la hora del sistema operativo del celular/computadora a
      una zona horaria distinta y ver si el calendario y las horas
      mostradas siguen teniendo sentido.

## 8. Prueba en el navegador, no solo en la pantalla

- [ ] Abrir la consola del navegador (F12 → Console) mientras se navega
      por toda la app normalmente — cualquier `Error` en rojo (no
      advertencias amarillas) es una pista de un bug real, aunque la
      pantalla "se vea bien". Así se encontraron varios de los bugs
      corregidos en esta ronda (funciones que no existían y rompían el
      formulario completo sin ningún aviso visual).
- [ ] Recargar la página a mitad de un formulario largo (Autorizados,
      Registro) — confirmar que no queda en un estado raro.
- [ ] Probar con el "modo incógnito" del navegador, sin ninguna sesión
      guardada — confirmar que el flujo de login/registro funciona
      igual de bien que con historial normal.

## 9. Móvil específicamente

- [ ] Probar todo lo de arriba también desde un celular real, no solo
      achicando la ventana del navegador de escritorio — el teclado
      numérico/de letras que aparece automáticamente en el celular
      (`inputmode`) puede comportarse distinto a escribir con teclado
      físico.
- [ ] Confirmar que el menú de navegación (☰) abre y se puede usar para
      llegar a cualquier sección.
- [ ] Girar el celular a horizontal a mitad de un formulario — confirmar
      que no se pierde lo ya escrito.

## 10. Subir archivos que no son lo que parecen

- [ ] En **Autorizados**, **Vetos**, **Reportar incidencia** y **Acceso
      rápido** (garita): renombrar un archivo que NO es imagen (un
      `.txt`, un `.pdf`) a extensión `.jpg` y tratar de subirlo como
      foto — debe mostrar un error claro, nunca quedarse en silencio.
- [ ] Subir una foto real pero interrumpir la conexión justo mientras se
      procesa (activar/desactivar el WiFi rápido).
- [ ] Intentar subir un archivo de foto vacío (0 bytes) o dañado a
      propósito (abrir una imagen en un editor de texto, guardar unos
      caracteres random encima, y subir eso).

## 11. Sesión que expira a mitad de uso

- [ ] Iniciar sesión, y sin cerrar la pestaña, dejarla abierta más de 8
      horas (o cambiar la hora del sistema operativo hacia adelante para
      simularlo más rápido) — al volver e intentar hacer cualquier
      acción, debe mandar de vuelta a la pantalla de login correcta
      (residente/guardia/admin según el rol que tenía), con un mensaje
      claro de que la sesión expiró — no debe quedarse mostrando el
      panel con un error críptico repetido cada vez que se toca algo.
- [ ] Cerrar sesión en una pestaña y, sin recargar, intentar usar otra
      pestaña que sigue abierta con la misma cuenta — confirmar qué pasa
      ahí también.

## 12. Un mismo código QR escaneado dos veces casi al mismo tiempo

- [ ] Con una invitación de un solo uso (ej. para un repartidor), pedirle
      a dos personas que la escaneen **casi al mismo tiempo** desde dos
      celulares distintos, en dos garitas si el residencial tiene más de
      una — solo una debe pasar; la segunda debe mostrar un mensaje
      claro de "ya no tiene usos disponibles", no dejar pasar a ambas.
- [ ] Escanear el mismo código dos veces seguidas rápido desde el mismo
      celular (doble tap en "Confirmar") — mismo resultado esperado.
- [ ] Revisar en el panel de administración que el conteo de usos de esa
      invitación quede correcto (no duplicado) después de la prueba.

---

## Cómo reportar lo que se encuentre

Para cada bug encontrado, lo más útil para quien lo va a arreglar es:

1. **Qué se escribió/hizo exactamente** (copiar y pegar el texto usado,
   no solo describirlo — "puse un nombre raro" no es reproducible,
   `"Juan<script>alert(1)</script>"` sí lo es).
2. **Qué pantalla y qué rol** (residente/guardia/admin/superadmin).
3. **Qué se esperaba que pasara** vs. **qué pasó realmente**.
4. Si es posible, una captura de pantalla y/o de la consola del
   navegador (F12 → Console) en el momento del error.
