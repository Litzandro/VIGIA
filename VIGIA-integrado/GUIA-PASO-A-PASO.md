# Guía paso a paso — VIGIA 2.0

## Primero: identifica tu caso

- **Ya tienes la versión anterior funcionando:** usa la migración `database/02_retroalimentacion_vigia.sql`.
- **Vas a instalar desde cero:** usa `database/vigia_schema.sql`.

No ejecutes ambos archivos sobre la misma base de datos.

## A. Actualizar una base VIGIA existente

### 1. Haz una copia de seguridad

En MySQL Workbench:

1. Abre **Server > Data Export**.
2. Selecciona la base `vigia`.
3. Marca **Export to Self-Contained File**.
4. Guarda el respaldo antes de continuar.

### 2. Ejecuta la migración una sola vez

1. Ve a **File > Open SQL Script**.
2. Abre `database/02_retroalimentacion_vigia.sql`.
3. Ejecuta todo con el icono del rayo.
4. Actualiza **Schemas**.

La migración agrega 17 tablas nuevas y amplía `accesos` e `incidencias`.

## B. Instalar la base desde cero

1. Abre MySQL Workbench.
2. Ve a **File > Open SQL Script**.
3. Abre `database/vigia_schema.sql`.
4. Ejecuta todo el archivo.
5. Actualiza **Schemas** y confirma que exista `vigia`.

## C. Preparar el proyecto

### Opción con el archivo BAT

Dentro de la carpeta descomprimida `VIGIA-integrado`, haz doble clic en:

```text
01_PREPARAR.bat
```

El archivo ahora cambia automáticamente a la carpeta correcta y usa `npm.cmd`, por lo que funciona desde PowerShell o el Explorador de Windows.

### Opción por PowerShell

Abre PowerShell dentro de `VIGIA-integrado` y ejecuta:

```powershell
npm.cmd install
```

## D. Configurar `.env`

Si todavía no existe, copia `.env.example` como `.env`.

Abre el archivo y configura:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=vigia
DB_USER=root
DB_PASSWORD=TU_CLAVE_DE_MYSQL
JWT_SECRET=UNA_CLAVE_PRIVADA_LARGA_Y_ALEATORIA
JWT_EXPIRES_IN=8h
```

Si MySQL no usa contraseña:

```env
DB_PASSWORD=
```

No subas `.env` a GitHub.

## E. Crear datos de demostración

Ejecuta:

```powershell
npm.cmd run seed:demo
```

O abre:

```text
02_CREAR_DATOS_DEMO.bat
```

Este paso crea o actualiza usuarios de prueba, configuración, contactos, plan, suscripción e integración simulada.

## F. Iniciar el sistema

Ejecuta:

```powershell
npm.cmd run dev
```

O abre:

```text
03_INICIAR_VIGIA.bat
```

Mantén la terminal abierta y entra a:

```text
http://localhost:3000
```

Verifica la base de datos en:

```text
http://localhost:3000/api/health
```

Debe responder con `status: ok` y `db: conectada`.

## G. Recorrido recomendado por rol

### Residente

1. Entra con `jorge.paz@correo.com` / `vigia123`.
2. Abre **Autorizados** y registra un bus escolar o familiar.
3. Abre **Vetos** y crea una solicitud.
4. Reporta una incidencia con fotografía.
5. Prueba **Chat**, **Comunidad**, **Emergencias** y **Configuración**.
6. En **Seguridad**, revisa sesiones y dispositivos.

### Guardia

1. Entra con `jorge.reyes@vigia.com` / `vigia123`.
2. Abre **Acceso rápido**.
3. Toma una fotografía obligatoria y agrega la persona a la cola.
4. Inicia, autoriza o rechaza el proceso.
5. Revisa tiempo promedio, límite de cola, turnos y mensajería.

### Administrador

1. Entra con `admin@vigia.test` / `Vigia2026!`.
2. Crea guardias o residentes.
3. Revisa **Vetos y conflictos**.
4. Gestiona turnos y relevos en **Operación**.
5. Configura o prueba integraciones.

### Superadministrador

1. Entra con `superadmin@vigia.test` / `Vigia2026!`.
2. Crea una nueva residencial.
3. Crea cuentas por rol.
4. Revisa planes, suscripciones y benchmark.

## H. Probar el modo offline

1. Inicia sesión mientras hay conexión.
2. Abre las herramientas de red del navegador y activa el modo offline, o desconecta temporalmente la red.
3. Registra una operación compatible, como una incidencia o publicación.
4. VIGIA la guarda en la cola local.
5. Recupera la conexión.
6. La sincronización automática envía la operación con un identificador único para evitar duplicados.

La interfaz puede abrir desde caché, pero el primer inicio de sesión siempre requiere el servidor.

## I. Probar integraciones

En `integraciones.html` puedes registrar:

- Tranca o portón.
- Cámara.
- Sistema existente de la colonia.
- Webhook.
- Proveedor futuro de IA.

El botón de prueba crea un evento simulado. No abre una tranca ni consulta una cámara real hasta conectar el proveedor correspondiente.

## Errores comunes

### `Access denied for user 'root'`

Revisa `DB_USER` y `DB_PASSWORD` en `.env`. Si indica `using password: NO`, la contraseña está vacía o no se está leyendo.

### `Unknown database 'vigia'`

No se ejecutó el esquema completo, o `DB_NAME` no coincide.

### `ECONNREFUSED 127.0.0.1:3306`

Inicia el servicio MySQL desde **Servicios** de Windows.

### `Cannot find module ...`

Ejecuta `npm.cmd install` en la misma carpeta donde está `package.json`.

### `ERR_CONNECTION_REFUSED` en `localhost:3000`

La terminal con `npm run dev` está cerrada o el servidor falló al iniciar. Lee el último error mostrado en PowerShell.

### La migración dice que una tabla o columna ya existe

La migración ya se ejecutó antes. Restaura el respaldo o corrige solo el paso pendiente; no vuelvas a ejecutar el archivo completo.

### El puerto 3000 está ocupado

Cambia en `.env`:

```env
PORT=3001
```

Luego abre `http://localhost:3001`.
