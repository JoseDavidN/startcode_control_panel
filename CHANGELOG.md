# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

---

## [0.5.0] — 2026-10-09

Versión **menor** sobre 0.4.0: nuevo módulo de conexiones a bases de datos externas. Va junto con la app de escritorio 0.3.0. En desarrollo: esta sección se completa con cada cambio de la versión.

### Añadido
- Módulo `databases` (`src/databases/`): conexiones a MySQL, MariaDB, PostgreSQL y Redis guardadas por usuario en `tbl_database_connections` (migración `add_database_connections.sql`), ligadas a quien las crea (`str_user_id`, borrado en cascada). Cada usuario solo ve, edita y usa las suyas; una ajena responde 404
- Endpoints bajo `/databases` (JWT): `GET` lista, `POST` crea, `PATCH /:id` edita (`password` omitida conserva la actual, vacía la borra), `DELETE /:id`, `GET /:id/password` devuelve la contraseña en claro para el formulario de edición (limitado a 10/min), `POST /test` prueba datos sin guardar (con `connectionId` y sin `password` usa la guardada). Crear y editar no conectan: se da por hecho que una conexión guardada funciona (el formulario la prueba antes con `POST /test`)
- Contraseñas cifradas con AES-256-GCM (`CredentialsCipherService`): IV aleatorio por valor, formato `v1:<iv>:<tag>:<cifrado>`, columna `str_password_enc` con `select: false`. Nueva variable `DB_CREDENTIALS_KEY` (32 bytes en hex o base64, `openssl rand -hex 32`); sin ella el panel arranca con un aviso y solo fallan las operaciones con contraseñas. Las respuestas de la API nunca llevan la contraseña, solo `hasPassword`
- Prueba de conexión (`DatabaseProbeService`, drivers `pg`, `mysql2` e `ioredis`, tiempo límite de 5 s) para `POST /databases/test`: versión del motor y error traducido (credenciales, base inexistente, host inalcanzable, conexión rechazada…). Las conexiones guardadas no se comprueban nunca por su cuenta: ni revisión periódica ni al guardar ni desde la lista
- Gestión de conexiones MySQL y MariaDB (`DatabaseExplorerService`): `GET /databases/:id` (una conexión), `GET /databases/:id/schemas` (bases visibles; si la conexión apunta a una base, solo esa, y las del sistema van al final marcadas con `system`), una ruta por sección de cada base, que el árbol pide al desplegarla: `GET /databases/:id/schemas/:schema/tables` (tablas con filas estimadas y columnas: tipo, nulabilidad y clave), `…/views` (vistas con sus columnas), `…/triggers` (momento, evento y tabla), `…/indexes` (tabla, unicidad, tipo y columnas en orden) y `…/procedures` (parámetros y primera línea del comentario) y `POST /databases/:id/query` (`RunQueryDto`: una sentencia, opcionalmente sobre `schema`, 30 s como máximo, hasta 1000 filas con `truncated`, `affectedRows` e `insertId` para las que no devuelven filas; 60/min). Un error de SQL responde 400 con el mensaje del motor. Una conexión apuntada a una base no deja consultar otras. Fechas y enteros grandes viajan como texto y los binarios en hex. Los demás motores responden 400 «todavía no disponible»
- Confirmación y auditoría de consultas peligrosas (`services/query-policy.ts`): `DROP` de bases, tablas y otros objetos, `TRUNCATE`, `DELETE` o `UPDATE` sin `WHERE`, `ALTER TABLE … DROP`, `RENAME TABLE`, `GRANT`/`REVOKE`, alta o cambio de usuarios y contraseñas, `SHUTDOWN`/`KILL`, `LOAD DATA` e `INTO OUTFILE/DUMPFILE`. Se analizan sin comentarios ni contenido de cadenas o identificadores entre comillas, para que un `'drop table'` en un texto o un `WHERE` dentro de un string no cuenten. Sin `confirm: true` en `RunQueryDto`, `POST /databases/:id/query` responde 400 `DANGEROUS_QUERY` (con `message` y `hint`) y no ejecuta nada. Las confirmadas se guardan en `tbl_database_query_audit` (migración `add_database_query_audit.sql`): usuario, conexión, base, sentencia, motivo, estado, filas afectadas, error y duración, también si el motor las rechaza; los resultados no se guardan. `GET /databases/:id/audit` devuelve las 50 últimas
- Edición de filas desde los resultados: `POST /databases/:id/query` devuelve, para las sentencias con filas, `columnMeta` (base, tabla y columna real de cada campo, sin alias, agrupadas por tabla y alias para que un self-join no se mezcle), `tableKeys` (índices de la clave primaria de cada tabla presente) y `readOnlyReason` (cálculo sin tabla, tabla sin clave primaria o clave primaria fuera del SELECT). Una columna es editable si su tabla tiene la clave primaria completa en el resultado. `POST /databases/:id/rows/update` (`UpdateRowDto`: `schema`, `table`, `key`, `changes`) hace un UPDATE de una sola fila: exige que `key` sea exactamente la clave primaria, valida las columnas contra `information_schema`, escapa identificadores y pasa los valores como parámetros, con `<=>` y `LIMIT 1`; si no encuentra la fila responde 400 pidiendo volver a consultar
- Gestión de PostgreSQL (`PostgresExplorerService`; `DatabaseExplorerService` reparte por motor y los tipos comunes pasan a `services/explorer.common.ts`): el nivel «base» del árbol son las bases del servidor (`pg_database`) y cada llamada abre la conexión sobre la que toca. Tablas (incluidas las particionadas, con filas estimadas de `reltuples`), vistas (también materializadas), triggers (momento y eventos decodificados de `tgtype`), índices (método y columnas, `(expresión)` en los de expresión) y funciones y procedimientos (sin los de extensiones) de todos los esquemas del usuario, cada objeto con su `namespace`. Las consultas van por el protocolo extendido (una sola sentencia, como MySQL con `multipleStatements: false`), con `statement_timeout` de 30 s; fechas, horas e intervalos llegan como texto y `int8`/`numeric` conservan todos sus dígitos. Los metadatos de edición salen del oid de tabla y número de columna de cada campo: una vista, una tabla sin clave primaria o que aparece dos veces en el resultado (self-join) quedan en solo lectura. `rows/update` acepta `namespace` (por defecto `public`) y en PostgreSQL usa parámetros `$n` con `IS NOT DISTINCT FROM`. Errores del servidor traducidos, con posición, detalle y sugerencia cuando los hay
- Política de consultas peligrosas según el motor (`findDangerousQuery(sql, dialect)`): en PostgreSQL `#` no es comentario y se ignora el contenido de las cadenas con dólar (`$$…$$`). Se añaden, para los dos motores, cualquier `DROP`, `ALTER TABLE … RENAME`, roles (`CREATE/ALTER/DROP ROLE`, `REASSIGN OWNED`) y, en PostgreSQL, `COPY` a o desde archivos o programas, `pg_terminate_backend`/`pg_cancel_backend` y `DELETE`/`UPDATE` sin `WHERE` dentro de un `WITH`
- Sesiones de la vista de consultas (`DatabaseSessionService`): `POST /databases/:id/sessions` conecta y devuelve `sessionId` y la versión del motor (que se guarda en la conexión); `DELETE /databases/:id/sessions/:sessionId` cierra. Las rutas de gestión aceptan la sesión (`?session=` en las de lectura, `sessionId` en `query` y `rows/update`) y reutilizan su conexión en vez de abrir una por llamada: una conexión MySQL (con `USE` al cambiar de base) o un cliente PostgreSQL por base, con las llamadas de la sesión en serie. Una sesión cerrada, ajena o de otra conexión responde 400 `DB_SESSION_CLOSED`. Se cierran solas tras 30 minutos sin uso, al editar los datos de conexión o borrar la conexión, y como máximo hay 5 por usuario. La creación de conexiones de gestión pasa a `services/connection-factory.ts`
- Se elimina `POST /databases/:id/check` y la comprobación al guardar: el estado de la conexión ya no se mantiene
- `POST /databases/schemas`: bases que ve el usuario con datos de conexión sin guardar (mismo cuerpo que `POST /databases/test`; en edición, con `connectionId` y sin `password` usa la contraseña guardada), para el selector de base del formulario. MySQL, MariaDB y PostgreSQL (`pg_database`, sin plantillas y solo las que admiten `CONNECT`); las del sistema van al final. Los errores de PostgreSQL (credenciales, base inexistente, host) se traducen igual que los de MySQL
- Dependencias `mysql2` y `@types/pg` (dev)
- Despliegue en producción con Docker (`DEPLOY.md`): `Dockerfile` multi-etapa (Node 24 slim, pnpm por corepack, herramientas de compilación solo en las etapas de build para los módulos nativos de `ssh2`/`cpu-features`; imagen final con `dist/`, dependencias de producción y `public/`, usuario `node`, `HEALTHCHECK` sobre `/api/v1/health`), `.dockerignore`, `docker-compose.yml` (API, PostgreSQL 16 y Redis 7 solo caché con contraseña obligatoria; Postgres y Redis sin puertos publicados, healthchecks y `depends_on` por salud, `agent-dist` montado de solo lectura, rotación de logs) y `.env.production.example`
- Esquema inicial de la base para instalaciones nuevas (`docker/postgres/initdb/01-schema.sql`, lo aplica Postgres al crear el volumen): hasta ahora en producción, con `synchronize` apagado, solo existían migraciones incrementales y no había forma de crear las tablas base. `docker/generate-schema.sh` lo regenera desde las entidades de TypeORM en un Postgres temporal

### Corregido
- `@nestjs/cache-manager`, `cache-manager`, `cache-manager-ioredis-yet` e `ioredis` estaban en `devDependencies` aunque el backend los carga al arrancar: con una instalación solo de producción (`pnpm install --prod`, la imagen Docker) no arrancaba (`Cannot find module '@nestjs/cache-manager'`). Pasan a `dependencies`

---

## [App de escritorio 0.3.0] — 2026-10-09

Versión **menor** sobre 0.2.0, centrada en el tab de Bases de Datos. En desarrollo: esta sección se completa con cada cambio de la versión. Requiere el backend 0.5.0 (módulo `databases`).

### Añadido
- Tab **Bases de Datos** (`pages/databases/Databases.tsx`, ruta `ROUTES.DATABASES` = `/databases`): el ítem del sidebar deja de estar marcado «Pronto» y navega a la página. Sigue el patrón de Servidores: tarjeta de presentación y buscador fijos, y solo la rejilla desplaza su contenido dentro del alto del contenedor principal
- Tarjeta de conexión con datos reales del backend (`hooks/useDatabases.ts`, `services/databases.api.ts`): logo real del motor (`components/databases/EngineIcon.tsx`, trazados de Simple Icons, CC0, pintados con `currentColor` y el tono del motor para seguir al tema), nombre, motor y versión, host e IP con puerto, base de datos a la que apunta la conexión (o «Servidor completo») y usuario. Sin estado de conexión ni fecha de comprobación: la tarjeta no conecta a nada
- Botón **Agregar conexión** en la barra del buscador, siempre a mano sin importar cuántas conexiones haya
- Formulario de conexión (`components/databases/ConnectionModal.tsx`, sobre `Modal`) para crear y editar: motor elegido con botones que llevan su logo, nombre, host, puerto, usuario, contraseña y base de datos opcional (vacía conecta al servidor completo). El puerto sigue al motor (3306, 5432, 6379) mientras no se cambie a mano; en Redis el usuario es opcional y la base es su índice de 0 a 15 (vacío usa la 0). «Probar conexión» prueba los datos sin guardarlos y muestra versión y latencia o el error; guardar no conecta
- Selector de base de datos en el formulario de conexión (`components/databases/DatabasePicker.tsx`): al pulsar el campo se conecta con los datos escritos y lista las bases disponibles, con «Servidor completo» arriba y las del sistema aparte al final. Se puede seguir escribiendo el nombre a mano, lo escrito filtra la lista y se navega con flechas y Enter. La lista se vuelve a pedir solo si cambian motor, host, puerto, usuario o contraseña; en edición usa la contraseña guardada sin revelarla. En Redis el campo sigue siendo el índice 0–15
- Edición desde la tarjeta (botón de lápiz), con «Eliminar» de doble confirmación. El campo de contraseña tiene el icono del ojo para verla u ocultarla: en edición la contraseña guardada no se descarga hasta pulsarlo (`GET /databases/:id/password`) y, si no se revela ni se escribe, se conserva la actual. Es el único sitio de la app donde aparece en claro
- Vista de gestión de una conexión (`pages/databases/DatabaseDetail.tsx`, ruta `ROUTES.DATABASE_DETAIL` = `/databases/:id`), al pulsar la tarjeta. Misma ventana que el resto, con alto fijo y scroll interno por zona: cabecera con nombre, motor, versión, estado, host y usuario; debajo dos columnas 30/70 (árbol y editor) y, a todo el ancho, los resultados
  - Árbol de bases (`components/databases/SchemaTree.tsx`): todas las disponibles si la conexión no apunta a una base, o solo esa, con buscador de bases. Si la conexión apunta a una base concreta, esa base aparece ya desplegada al entrar. Al pulsar una base queda como base activa del editor y se despliegan sus secciones: **Tablas** (con buscador y filas estimadas), **Vistas**, **Triggers** (momento, evento y tabla), **Índices** (tabla, columnas y si es único) y **Procedimientos** (parámetros). Cada sección carga su contenido al desplegarla y muestra cuántos elementos tiene; tablas y vistas despliegan sus columnas con tipo y clave primaria. Doble clic carga en el editor la sentencia del objeto: `SELECT * … LIMIT 100` en tablas y vistas, `SHOW CREATE TRIGGER`, `SHOW INDEX FROM` la tabla del índice y `SHOW CREATE PROCEDURE`
  - Editor SQL (`components/databases/SqlEditor.tsx`) con filas numeradas, Tab para indentar y Ctrl/⌘ + Enter para ejecutar; con texto seleccionado se ejecuta solo la selección
  - Resaltado de sintaxis con paleta propia de cada tema: palabras reservadas, funciones, tipos, cadenas, números, identificadores entre comillas invertidas, comentarios y operadores. Tokens `--sql-*` en los tres archivos de tema (las reservadas siguen a la marca: violeta en Nocturno, cian en Aurora, naranja en Solar), clases `.sql-*` en `App.css` y `tokenizeSql` en `utils/sql.ts`. El editor pasa a ser un `textarea` transparente sobre un `<pre>` resaltado que sigue su scroll. `.scroll-thin` fija también el alto de la barra horizontal (6 px)
  - Las palabras reservadas de SQL (`SELECT`, `FROM`, `INNER JOIN`, `WHERE`, `LIMIT`, `COUNT`…) pasan solas a mayúsculas al cerrarlas con espacio, salto de línea, paréntesis, coma o punto y coma (`utils/sql.ts`). No se tocan dentro de cadenas, identificadores entre comillas invertidas, comentarios ni como parte de otro identificador (`tbl.from`), ni el texto pegado; palabras que suelen ser nombres de columna (`status`, `name`, `date`, `user`…) quedan fuera de la lista
  - Resultados (`components/databases/QueryResults.tsx`) en tabla con cabecera y numeración fijas (`.sticky-cell`: fondo casi opaco, sin blur), scroll en los dos ejes, `NULL` diferenciado, número de filas, tiempo de la consulta, filas afectadas en sentencias de escritura y el error del motor si falla
  - Selección y copia de filas (`components/databases/ResultGrid.tsx`): clic en `#` selecciona o deselecciona todas; clic en el número de una fila la selecciona, con Ctrl/⌘ suma o quita y con Mayús elige un rango; Ctrl/⌘ + A selecciona todo y Escape limpia. Las filas seleccionadas se resaltan con el color del tema y se copian con Ctrl/⌘ + C o el botón «Copiar N filas» como TSV, listo para pegar en una hoja (con todas seleccionadas incluye la cabecera; las columnas ocultas se copian enmascaradas)
  - Edición en línea: doble clic en una celda editable abre un campo (Enter confirma, Escape descarta, «NULL» deja el valor en NULL). La celda cambiada queda marcada en ámbar y la fila muestra guardar y cancelar junto a su número; guardar hace el UPDATE de esa fila por su clave primaria (uno por tabla si la fila viene de un JOIN) y actualiza la tabla sin volver a consultar. Las columnas editables llevan un lápiz en la cabecera; si nada es editable, la barra dice por qué. Una columna sensible oculta hay que mostrarla antes de editarla. Los errores al guardar quedan en la fila para reintentar
  - `ExportMenu` pasa a su propio archivo; la exportación incluye los cambios ya guardados
  - Columnas sensibles ocultas por defecto en cada resultado (`utils/sensitiveColumns.ts`): se reconocen por el nombre con un diccionario (contraseñas y secretos: `password`, `passwd`, `pwd`, `pass`, `contraseña`, `clave`, `secret`, `token`, `api_key`, `hash`, `salt`, `pin`, `otp`, `cvv`…; correos: `email`, `e_mail`, `mail`, `correo`, `correo_electronico`…), normalizando tildes, mayúsculas y `camelCase`. Las palabras cortas solo cuentan como palabra completa (`user_pass` sí, `passenger` o `compass` no). Los secretos se muestran como `••••••••` de largo fijo y los correos como `j•••@d•••.com`; un ojo en la cabecera de cada columna la muestra u oculta. Al exportar, las columnas que siguen ocultas salen enmascaradas (el menú lo avisa). Es protección de pantalla: el backend envía los valores
  - Exportar resultados desde la barra de resultados (menú «Exportar»): **CSV** (RFC 4180, UTF-8 con BOM para que Excel lea tildes) y **XLSX** (una hoja «Resultados» con estilo de tabla del tema activo: cabecera con el color de marca y su tinta —violeta en Nocturno, cian en Aurora, naranja en Solar—, filas alternas teñidas de la marca y en blanco, bordes finos del mismo tono, también en celdas vacías; cabecera fija y con filtro, ancho de columna según el contenido; números como número y enteros grandes como texto para no perder dígitos). Se exportan las filas recibidas (hasta 1000). El XLSX se arma en `lib/tableExport.ts` con `fflate` en vez de una librería de hojas de cálculo; la descarga va por `lib/download.ts`. Nombre del archivo: conexión, base y fecha
  - Filas alternas clara/oscura según el tema (tokens `--row-stripe-1` / `--row-stripe-2` en los tres temas, clase `.data-table` en `App.css`), también en la numeración fija, y realce al pasar el ratón
  - Scroll vertical y horizontal en resultados con muchas columnas: la tabla mide lo que su contenido (`w-max`) y la rejilla de la vista fija su columna a `minmax(0,1fr)`, que antes crecía con la tabla y ocultaba el scroll horizontal. El tope de 320 px por celda va en un `div` interior (en una celda de tabla `max-width` no se respetaba)
  - Consultas peligrosas: el editor abre una confirmación (`Modal`) con el motivo, la sentencia y la base, y solo con «Ejecutar igualmente» se envía de nuevo con `confirm`. Botón «Auditoría» en la barra del editor (`components/databases/QueryAuditModal.tsx`) con las consultas peligrosas confirmadas sobre la conexión: estado, motivo, fecha, sentencia, base, duración, filas afectadas o error
  - MySQL, MariaDB y PostgreSQL; para Redis la vista indica que llega pronto. En PostgreSQL el árbol muestra los objetos de otros esquemas con su prefijo (`ventas.pedidos`; `public` va sin prefijo), la sección de rutinas se llama «Funciones y procedimientos», y el doble clic usa comillas dobles y sentencias del catálogo (`pg_get_triggerdef`, `pg_indexes`, `pg_get_functiondef`) en lugar de `SHOW CREATE` (`utils/sqlDialect.ts`). El editor resalta y pasa a mayúsculas con las reglas de PostgreSQL: "…" es un identificador, `#` es un operador, `$$…$$` es una cadena y `::` un operador; se añaden tipos (`jsonb`, `timestamptz`, `bytea`…) y palabras (`ILIKE`, `RETURNING`…)
- `StatusBadge` pasa a `components/databases/StatusBadge.tsx` para usarse en la lista y en la vista de gestión
- La conexión a la base solo vive en la vista de consultas (`useDatabaseSession`): se abre al entrar (`POST /databases/:id/sessions`), el árbol, el editor y la edición de filas la reutilizan, y se cierra al salir de la vista o al cerrar la ventana (`DELETE` con `keepalive`). La cabecera muestra el estado de esa conexión (Conectando… / Conectada / Sin conexión) y, si se pierde, el motivo y «Reconectar». Fuera de esa vista el panel no conecta a ninguna base
- Buscador de conexiones por nombre, motor, IP o base de datos
- Rejilla de 3 tarjetas por fila con paginación de 3 filas (9 conexiones) por página; la barra de paginación queda fija bajo la rejilla, solo aparece con más de una página y la búsqueda vuelve a la primera
- Tipos `DatabaseConnection`, `DatabaseConnectionForm`, `DatabaseEngine`, `DATABASE_ENGINES`, `DATABASE_ENGINE_LABELS` y `DATABASE_DEFAULT_PORTS` (`types/database.types.ts`). Motores soportados por ahora: MySQL, MariaDB, PostgreSQL y Redis

### Corregido
- Vista de gestión de bases de datos: el scroll del árbol y de los resultados iba a tirones y escribir en el editor tenía retraso
  - Cada tecla re-renderizaba la vista entera, con la tabla de resultados (hasta 1000 filas) y todo el árbol: `QueryResults` y `SchemaTree` van con `memo` y el callback del árbol es estable
  - Las celdas fijas de resultados usaban `.glass-float`, que dentro de un panel aplica `backdrop-filter`: una capa desenfocada por celda. Pasan a `.sticky-cell`, con el mismo fondo y sin blur; las filas alternas van como color de fondo y solo las celdas fijas usan capa de imagen
  - Nueva clase `.scroll-layer` (capa propia, `contain: paint`) en el árbol, los resultados y el editor: desplazar o escribir ya no repinta el panel de cristal entero
  - Las filas del árbol solo animan el color (antes `mo-tab`, con cinco propiedades en transición)
- Copiar al portapapeles fallaba («No se pudo copiar») con el panel servido por http desde otra máquina o en algunos webviews: `navigator.clipboard` solo existe en contexto seguro. Nuevo `lib/clipboard.ts` (`copyText`) que, sin contexto seguro o si se rechaza la escritura, copia con un textarea temporal y `execCommand('copy')`. Lo usan la copia de filas de resultados y los botones de copiar de los códigos de respaldo y el secreto 2FA (Configuración → Seguridad) y del comando `ssh-keygen` al agregar un servidor, que tenían el mismo fallo
- Resultados: un resultado sin metadatos de edición (consultado antes de actualizar el backend) decía que la columna no era editable; ahora pide volver a ejecutar la consulta
- Editor SQL: una consulta peligrosa mostraba el aviso como error en Resultados en vez de abrir la confirmación. `api.service` rechaza con un `ApiError` plano y el código `DANGEROUS_QUERY` se buscaba en `response.data`, donde no está

### Cambiado
- Dashboard: el indicador **Bases de Datos** deja de estar en «Próximamente» y muestra cuántas conexiones hay guardadas, con el desglose por motor debajo («2 MySQL · 1 PostgreSQL»). Solo lee la lista de conexiones (`useDatabaseConnections`): no conecta a ninguna base
- Versión de la app a 0.3.0 en `FRONTEND/package.json`, `tauri.conf.json` y `Cargo.toml`

---

## [0.4.0] — 2026-10-08

Versión **menor** sobre 0.3.0: cambia el contrato de `POST /agent-data/servers/:id/commands`. Va junto con la app de escritorio 0.2.0.

### Añadido
- 2FA recordado 7 días por dispositivo: tras un código correcto (TOTP o de respaldo), `POST /auth/2fa/verify-login` devuelve `trustedDeviceToken`, un JWT de 7 días con la huella del secreto TOTP y de `passwordChangedAt`. `LoginDto.trustedDeviceToken` lo acepta y, si es válido y del mismo usuario, el login no pide el código. Cambiar la contraseña o desactivar y reactivar el 2FA lo invalida; sin migración
- Retención automática del historial de métricas (`MetricsRetentionService`): cada día a las 03:30 borra de `tbl_agent_metrics_history` los puntos de más de 30 días, en tandas de 10.000 para no bloquear la tabla mientras los agentes insertan. El historial lo usa el gráfico de 24 h del dashboard (`GET /agent-data/servers/:id/historical`); antes solo se purgaba a mano desde Configuración
- Política de la línea de comandos (`monitoring/services/command-policy.ts`): rechaza con `BLOCKED_COMMAND` (400), antes de abrir SSH y sin auditar, los comandos que cambian de directorio, muestran la ruta, inspeccionan discos o abren un shell
- `CommandResult.home`: home del usuario SSH, resuelto desde `$SUDO_USER` para que con sudo no sea `/root`

### Cambiado
- Los comandos se ejecutan siempre en el home del usuario SSH; el directorio ya no se arrastra entre comandos. `ExecCommandDto` deja de aceptar `cwd` (con `forbidNonWhitelisted` una petición que lo mande da 400) y `CommandResult` deja de devolver `nextCwd`. La auditoría guarda el home como directorio

### Eliminado
- `GET /agent-data/storage-stats` y `POST /agent-data/cleanup` (con `AgentDataService.getStorageStats` y `cleanOldMetrics`): la retención de datos no se aplicaba y la app ya no los usa. La purga pasa a ser automática (ver Añadido)
- `monitoring.retentionDays` de las preferencias (`UpdatePreferencesDto` lo rechaza). `mergePreferences` descarta las claves que ya no existen en los valores por defecto, así que el valor guardado deja de devolverse y no vuelve como 400 al guardar

### Corregido
- Sesiones activas: la app de escritorio se identifica con `X-StartCode-Client: desktop/<versión>` y el backend lo añade al user-agent (`StartCodePanel/<versión>`), porque el webview no se distingue de un navegador. La IP se toma de `X-Forwarded-For`, `X-Real-IP` o el socket y se guarda normalizada (`::ffff:1.2.3.4` → `1.2.3.4`, `::1` → `127.0.0.1`)
- Un `sudo ` escrito al inicio del comando se quita y el comando va por la escalera de sudo del panel con `sudo: true`, en vez de duplicarse o quedarse pidiendo contraseña sin TTY. `sudo` con opciones se respeta tal cual

---

## [App de escritorio 0.2.0] — 2026-10-08

Versión **menor** sobre 0.1.1: trae funciones nuevas (actualizaciones automáticas, línea de comandos flotante y su validador) además de cambios y correcciones.

### Añadido
- Actualizaciones automáticas reales: `UpdaterProvider` (`contexts/UpdaterContext.tsx`) busca versión nueva 15 s después de abrir la app y cada 6 h. Con **Actualizaciones automáticas** la descarga en segundo plano (en Linux y macOS además la instala y se aplica al reiniciar; en Windows espera a «Reiniciar ahora», porque instalar cierra la app). Con **Notificar nuevas versiones** muestra un aviso con «Instalar» o «Reiniciar ahora», uno por versión. Las dos preferencias se guardan en el store local de Tauri (`startcode:updates`); antes los switches eran estado de la pantalla y no hacían nada
- `notify.action` para avisos con botón de acción
- El código 2FA se pide una vez cada 7 días por equipo: el token de dispositivo de confianza se guarda por cuenta en el store local de Tauri (`startcode:2fa-trusted`, `lib/trustedDevice.ts`) y se envía en el login; no se borra al cerrar sesión. Configuración → Seguridad lo indica

### Cambiado
- Indicadores del dashboard: quedan **Servidores Online**, **Bases de Datos** (conexiones activas) y **Cloud** (estado en línea). Se retiran las tarjetas de Servicios, Sitios Web y Bases de Datos detectadas, cuyo detalle sigue en cada servidor
- Bases de Datos y Cloud se muestran como «Próximamente» (valor `—` atenuado) hasta que existan el tab de bases de datos y el módulo cloud; `Kpi` acepta `pending` para ello
- Nuevo diseño del icono de StartCode Panel
- La línea de comandos pasa a ser una barra flotante (`CommandBar`) fija en la parte inferior del detalle del servidor, visible en cualquier tab. La salida, la confirmación de comandos peligrosos y la contraseña de sudo se abren encima de la barra; el botón `sudo` va al final de la línea
- Configuración → Monitoreo: los umbrales de alerta ya no se comparan con un valor «actual» (era el promedio de los servidores en línea y no representaba a ninguno); se indica que aplican a cada servidor por separado. Se retira la sección **Retención de datos** (selector de días, estadísticas del historial y «Purgar ahora»), porque el selector no se aplicaba; en su lugar, **Historial de métricas** informa que se conservan 30 días, la limpieza diaria a las 03:30 y que el dashboard grafica 24 h
- Configuración → Sistema: se quitan las filas **Uptime backend** (no daba un dato real) y **ORM**, la línea de uptime del registro de estado y el botón de refrescar junto al título de Información del Sistema
- Tarjeta de servidor: se retiran **Sitios** y **BBDD** (el agente ya no los recolecta) y la segunda fila pasa a **Servicios**, **Procesos** y **Tiempo activo**. El pie muestra la antigüedad del último reporte (en ámbar si está desfasado) y cuántos servicios están activos de los instalados. `ServerRuntime` deja de exponer `websites` y `databases`
- Recursos detallados: el disco se muestra por disco físico, con el uso total arriba y sus particiones debajo (agrupadas por dispositivo: `sda1`/`sda2` → `sda`, `nvme0n1p2` → `nvme0n1`), en vez de una barra por partición como si fueran discos distintos. Un dispositivo montado varias veces se cuenta una sola vez
- La línea de comandos es para comandos puntuales, no una terminal: todos se ejecutan en el home del usuario SSH y el directorio ya no se arrastra entre comandos. Un validador en el backend (`command-policy.ts`, error `BLOCKED_COMMAND`) rechaza antes de conectar los que cambian de directorio (`cd`, `pushd`, `popd`), muestran la ruta (`pwd`, `dirs`, `$PWD`), inspeccionan discos (`df`, `du`, `lsblk`, `fdisk`, `mount`, `findmnt`, LVM, ZFS…) o abren un shell (`bash`, `sh`, `su`, `tmux`…); revisa cada tramo del comando (`;`, `&&`, `|`, `$( )`…) y salta envoltorios como `sudo`, `env` o `timeout`. El aviso aparece encima de la barra y el comando se queda para corregirlo. `ExecCommandDto` deja de aceptar `cwd`
- El tab **Comandos** solo muestra el registro de comandos ejecutados; pulsar uno lo carga en la barra
- Nueva superficie `.glass-float` con fondo casi opaco (`--glass-float-alpha` en los tres temas) para que la barra y su salida no se confundan con el contenido que pasa por debajo

### Corregido
- Sesiones activas: las de la app se muestran como «App de escritorio vX» con su sistema operativo (antes salían como un navegador web) y las del navegador llevan «(web)»; la IP aparece como «IP x.x.x.x» y normalizada. iOS y Android ya no se confunden con macOS y Linux
- Notificaciones del sistema: las alertas de seguridad (y su prueba) salían solo como toast dentro de la app. `@tauri-apps/plugin-notification` envía por `window.Notification`, y cuando el script del plugin no lo sustituye acaba en la API web del webview (el permiso se pedía con un aviso dentro de la app). Ahora se llama a los comandos del plugin con `invoke` (`is_permission_granted`, `request_permission`, `notify`); el toast interno queda solo como respaldo si el sistema no la entrega
- Seguridad → estado de la contraseña: tras cambiarla, el conteo de días seguía con la fecha anterior hasta recargar la app (`useChangePassword` no refrescaba el usuario). El texto dice «hoy» o «hace 1 día» y cuántos días faltan para que expire
- Línea de comandos: con `sudo` marcado, la barra muestra el prefijo `sudo` y la salida y el registro indican que el comando se ejecutó con sudo (antes se veía sin él)
- Un `sudo ` escrito a mano al inicio ya no se duplica ni falla por falta de TTY: el backend lo quita y ejecuta con la escalera de sudo del panel, que sabe pasar la contraseña. `sudo` con opciones (`sudo -u postgres …`) se respeta tal cual
- La ruta de la línea de comandos se muestra como un prompt de bash: el home del usuario SSH es `~` antes y después del primer comando (antes pasaba de `~` a `/home/<usuario>`). El backend devuelve `home` en el resultado, resuelto desde `$SUDO_USER` para que con sudo `~` no salte a `/root`

---

## [App de escritorio 0.1.1] — 2026-10-07

### Corregido
- La app de escritorio usaba los iconos genéricos de la plantilla de Tauri; ahora usa el de StartCode Panel en todos los tamaños y formatos (`src-tauri/icons/`, generados con `pnpm tauri icon` desde una imagen de 1024×1024): instalador, barra de tareas de Windows, Dock de macOS y menú de aplicaciones de Linux
- Versión de la app alineada en `tauri.conf.json`, `Cargo.toml` y `FRONTEND/package.json` (este último decía `1.0.0` sin uso)

---

## [0.3.0] — 2026-10-07

Versión **menor** sobre 0.2.0: todo lo acumulado desde mayo son funciones nuevas y correcciones; en 0.x los cambios de contrato (como el de `/health`) también van en una menor.

### Añadido (esta iteración)
- **Mantener sesión iniciada** en el login: refresh token de 30 días (`JWT_REFRESH_REMEMBER_EXPIRES_IN`), columna `bol_persistent` en `tbl_sessions` (migración `add_persistent_to_sessions.sql`) y sin cierre por inactividad; sin marcar, la sesión dura 7 días y los tokens van a `sessionStorage`
- **Línea de comandos** en el detalle de servidor — `POST /agent-data/servers/:id/commands`: comando por SSH sin TTY, 60 s y 1 MB de salida como máximo, directorio de trabajo arrastrado entre comandos, sudo opcional y confirmación para comandos peligrosos. Limitado a 30 por minuto
- **Auditoría de comandos** — tabla `tbl_command_audit` (migración `add_command_audit.sql`) con quién, servidor, comando, directorio, sudo, estado, código y duración; `GET /agent-data/servers/:id/commands`. La salida no se guarda
- **Contenedores Docker** — `POST /agent-data/servers/:id/docker/containers` (`docker ps` + `docker stats` por SSH, con sudo si hace falta) y tab «Docker» que aparece cuando el servidor tiene `docker.service`
- **Cerrar procesos** — `POST /agent-data/servers/:id/processes/:pid/kill` envía SIGTERM (sin `-9`); protege PID 1, `sshd`, `systemd` y el agente
- Tarjeta «Consumo de memoria» con los 5 procesos de más RSS (sustituye a «Procesos»); el agente Go 2.1.2 envía la unión del top por CPU y por memoria, con la línea de comandos
- Actualizador de la app de escritorio contra `releases.startcode.com.co`, novedades por versión (`FRONTEND/src/release/versions.json`) en Configuración → Sistema y workflow `desktop-build` para Linux, Windows y macOS

### Cambiado
- `GET /health` ya no expone host ni puerto de la base de datos, URL ni puerto del API, ni el ping: es público
- La versión del backend se lee de `package.json`; con `node dist/main` se mostraba siempre `1.0.0`
- `execOnClient` acepta `maxOutputBytes`; `ServiceControlService.resolveSudo` y `run` son públicos para reutilizar la escalera de sudo
- Rendimiento del frontend: carga por página, un store por servidor para el WebSocket y menos capas de `backdrop-filter`

### Corregido
- El tiempo activo salía en semanas en la lista y en días en el detalle
- `app.controller.spec.ts` no proveía `DataSource` ni `ConfigService`

### Añadido
- **El tab de servicios pasa a ser operable de verdad.** Iniciar, parar y reiniciar estaban cableados pero no funcionaban: `sudo systemctl` sin `-n` y sin PTY se colgaba hasta el timeout donde el usuario SSH no tenía NOPASSWD, un fallo de systemctl volvía como 200 con `success: false` y React Query lo daba por bueno, y la lista se leía del inventario del agente —de hasta cinco minutos antes— así que el estado nunca cambiaba después de actuar
- `ServiceControlService` resuelve privilegios como el instalador del agente (root / `sudo -n` / contraseña validada antes de tocar nada) sobre **una sola** conexión SSH, relee el estado con `systemctl show`, lo parchea en `services_list` y emite `server:services:updated`: el badge y el PID cambian al instante
- **Journal de una unidad** en el propio panel — `POST /agent-data/servers/:id/services/:name/logs` devuelve las últimas líneas de `journalctl -u`, que es lo que explica un `failed`. Se intenta sin sudo y solo se escala si el journal se queja
- **Servicios fijados por servidor** (`PUT /agent-data/servers/:id/services/pinned`, guardados en `metadata.pinnedServices`): un servidor reporta ~160 unidades y casi ninguna importa, así que las fijadas salen en su propia sección encima del inventario
- `enable` / `disable` desde la tarjeta: «Habilitado al arranque» era un texto informativo sobre algo que no se podía cambiar
- Confirmación antes de parar un servicio, y contraseña de sudo pedida en el mismo modal cuando el servidor la exige (se reutiliza mientras el detalle esté abierto; solo en memoria)
- `sshd`, `ssh` y `startcode-agent` no se pueden parar ni deshabilitar desde el panel: todo lo que el panel hace en la máquina viaja por SSH, así que pararlas la dejaría incomunicada sin forma de deshacerlo desde aquí. Reiniciarlas sigue permitido
- **Instalación del agente desde el panel** — al dar de alta un servidor, el agente se instala solo por SSH: comprueba permisos, systemd y arquitectura, el servidor remoto descarga el binario del propio panel (verificando su sha256), se escribe la configuración y arranca el servicio. Los pasos que enseña el modal ahora son trabajo real, no temporizadores
- **Desinstalación al eliminar un servidor** — se para el servicio y se borran binario, unidad y configuración. Si no se puede, el borrado **se bloquea** con el error a la vista y una casilla para eliminar de todos modos
- Tarjeta «Agente de monitoreo» en el detalle del servidor: estado, versión, fecha, último error y botones de instalar, reinstalar y desinstalar
- Contraseña de sudo opcional en el alta y en los reintentos, para servidores cuyo usuario SSH no es root. Viaja por stdin, no se registra ni se guarda
- `GET /api/v1/agent-releases/binary|manifest|install.sh` — artefactos del agente, autenticados con un token de instalación de 5 minutos (`type: agent-install`), no con el del agente ni abiertos
- `POST /servers/:id/agent/install`, `DELETE /servers/:id/agent`, `GET /servers/:id/agent`; `DELETE /servers/:id` acepta `force`
- `make release` en el repositorio del agente: publica binarios amd64/arm64, `install.sh` autocontenido, `uninstall.sh` y `manifest.json` en `BACKEND/agent-dist/`. Esa carpeta es todo el contrato entre los dos repositorios
- `deploy/uninstall.sh` en el agente (no existía nada para quitarlo) e `install.sh` reescrito: acepta el binario descargado, emite progreso paso a paso y hace `systemctl restart` en vez de `enable --now`, que con el servicio activo no relanzaba nada
- `PANEL_PUBLIC_URL` en el `.env` del backend: la URL por la que los servidores monitorizados alcanzan al panel, que no tiene por qué ser la del navegador
- **`GET /agent-data/servers-summary`** — cpu, memoria, disco, uptime y contadores de todos los servidores del usuario en **una** consulta sobre `tbl_agent_metrics`, con `null` donde todavía no hay dato
- `useServersLive` y `lib/serverRuntime.ts`: una única definición de estado y métricas para la lista, la cabecera y el dashboard, mezclando la instantánea HTTP con los eventos del WebSocket por marca de tiempo
- Estado «Sin datos» en la lista para un servidor que nunca ha reportado, en vez de enseñar 0 %

### Corregido
- **La lista de servidores no se actualizaba nunca.** Leía `metadata.cpu/memory/disk`, que ningún punto del backend escribe; su query no tenía `refetchInterval` (estaba comentado), `refetchOnWindowFocus` estaba desactivado, ningún evento del socket invalidaba `['servers']` y el botón «Actualizar» llamaba a `refreshAllServersStats()`, que era `getServers()` con otro nombre
- El dashboard tenía el mismo defecto y enseñaba 0 % cuando el WebSocket callaba; ahora usa la misma fuente que la lista
- **El cron de inactividad nunca marcaba nada como offline**: las fechas se guardaban en columnas `timestamp` sin zona, así que el backend escribía la hora UTC como si fuera local y al leerla la desplazaba por el huso. Migración a `timestamptz` en `dat_last_seen`, `lastCheckAt` y los `timestamp` de métricas e historial
- El cron ya avisa por WebSocket (`agent:disconnected` con `reason: inactivity`): antes marcaba OFFLINE en la base y nadie se enteraba hasta recargar
- `'offline'` se pintaba como «Atención» ámbar en la lista, porque el mapeo de estado solo contemplaba `'error'`
- El handler de `server:metrics:realtime` reemplazaba la entrada entera del servidor en el contexto y borraba servicios, sitios y bases cada 30 s
- Un servidor nuevo nacía como OFFLINE; ahora nace `pending` (el estado existía en el enum y no lo usaba nadie) y `getStats` cuenta `pending` y `warning`, que antes no sumaban en ningún contador

### Eliminado
- `hooks/useServerMetrics.ts` y `hooks/useServerStats.ts` (sin importadores; el segundo devolvía contadores fijos a 0), `ServerService.refreshAllServersStats()` y `ServersService.updateMetadata` (privado, sin llamadores)
- Los campos `cpu/memory/disk/uptime` del tipo `Server.metadata`: el tipo prometía datos que nadie escribía

- **SFTP gráfico** en el detalle de servidor — botón «SFTP» en la cabecera que abre un modal con una conexión viva: explorador del directorio remoto (navegar, crear carpeta, ruta editable con migas), y subida de archivos y carpetas completas por arrastrar y soltar o por el selector del sistema, con progreso y errores por archivo
- Backend `src/sftp/` — gateway WebSocket `/sftp` para la sesión y los metadatos, y `PUT /api/v1/sftp/sessions/:id/file` (octet-stream, en streaming, `@SkipThrottle`) para los bytes. Una conexión SSH dedicada por sesión con dos canales SFTP: navegar no se bloquea detrás de una subida
- `WsAuthService` (`src/auth/ws-auth.service.ts`) — autenticación de gateways WebSocket en un solo sitio; la terminal pasa a usarlo en vez de su copia
- Guardas de tipo para el `data` del agente (`src/monitoring/dto/agent-payload.ts`): validan lo imprescindible, toleran campos nuevos y rechazan un payload malo nombrando el campo exacto
- Columnas `cpu_manufacturer`, `cpu_brand`, `cpu_cores`, `cpu_physical_cores`, `system_arch`, `swap_free`, `network_interfaces`, `services_active` y `services_failed` en `tbl_agent_metrics`, con su migración. Todo esto ya lo enviaba el agente y se descartaba
- Resumen del detalle de servidor: modelo de CPU, núcleos lógicos/físicos y arquitectura; e interfaz de red real con MAC, estado y tráfico rx/tx
- Agente Go: `certExpiry` de los sitios (leído del certificado del vhost con `crypto/x509`), `sizeBytes` y lista de bases por motor, y `root` de los vhosts de nginx
- `timeUntil` y `daysUntil` en `utils/time.ts` — para fechas futuras, donde `timeAgo` respondía «hace un momento»
- `mise.toml` en el repositorio del agente fijando Go 1.27.1

### Corregido (contrato del agente)
- **Los inventarios ya no se pierden en un servidor recién dado de alta.** Se guardaban con `UPDATE ... WHERE server_id`, que en una tabla sin fila para ese servidor afecta a 0 filas y no avisa; y el agente manda `processes_inventory` antes que las primeras métricas, así que pasaba siempre. Ahora es un upsert
- `metadata.activeServices` guardaba el total de unidades systemd, no las activas: la tarjeta del listado de servidores decía ~160 «servicios activos» en cualquier máquina
- El resumen de procesos que viaja con las métricas se ignoraba; ahora se aplica (los contadores se refrescan cada 30 s en vez de cada 5 min) y un agente que no lo envíe ya no los pone a cero
- Un inventario de sitios o bases con la forma antigua machacaba la lista guardada con `[]`; ahora se rechaza y lo guardado se queda
- La interfaz de red del Resumen estaba escrita a mano como `eth0`
- El certificado de un sitio se pintaba con `timeAgo`, que para una fecha futura devuelve «hace un momento»

### Eliminado
- Tab «Archivos» del detalle de servidor — era un placeholder desde su creación; lo sustituye el modal SFTP
- `cpuPercent` de los servicios systemd en todo el recorrido (agente, DTOs y frontend): systemd no lo reporta por unidad y siempre viajaba en cero
- `Database.size` (cadena vacía en todos los envíos), sustituido por `sizeBytes`
- DTOs de payload sin uso de `agent-message.dto.ts`: exigían campos que el agente no manda (`processors`, `cached`, `buffers`, `rx_sec`, `tx_sec`), así que habrían rechazado el 100 % del tráfico real

- `DESIGN.md` — sistema de diseño completo como fuente de verdad para toda implementación visual
- `CLAUDE.md` — referencia obligatoria a `DESIGN.md` antes de tocar cualquier componente de UI
- Componente `RangeSlider` en `Settings.tsx` — slider personalizado cross-browser (CSS custom sobre input nativo invisible) con gradiente brand en track y thumb
- Sección "Actualizaciones" en `Settings/Sistema` — toggle de auto-actualización, notificaciones de actualización y botón de comprobación manual
- Sección "Otros" en `Settings/Notificaciones` — toggles para reporte semanal y novedades del producto
- Tres filas de sesiones activas en `Settings/Seguridad` con indicador de sesión actual
- Endpoints backend: `PATCH /auth/profile` y `POST /auth/change-password` con `JwtAuthGuard`
- DTOs backend: `UpdateProfileDto`, `ChangePasswordDto` con validación class-validator
- Hook `useUpdateProfile` y `useChangePassword` con TanStack Query mutations
- Constantes de API: `UPDATE_PROFILE`, `CHANGE_PASSWORD` en `constants.ts`
- Campos `firstname`, `lastname`, `twoFactorEnabled` en la entidad `User` y tipo `auth.types.ts`
- Tarjeta de estado del servidor primario en el sidebar de `AppLayout` (CPU % + barra de progreso)
- Mini-card de estado de servidor en sidebar con indicador online/offline animado
- `Modal.tsx` — tamaños `sm/md/lg/xl`, scroll interno con scrollbar brandada, `max-h-[88vh]`
- Animaciones `fadeIn` y `slideUp` en `App.css` para modales
- Scrollbar `.modal-scroll` con gradiente púrpura → rosa
- **`Login.tsx`** — rediseño completo con layout de dos paneles: panel izquierdo (tech showcase oculto en móvil) y panel derecho (formulario); componentes animados: `LiveSpark` (sparkline CPU en tiempo real, 700ms), `StatsStrip` con métricas drifting, `ServerOrbit` con anillos SVG giratorios y nodos regionales con pulso, `TerminalFeed` con logs en streaming; ventana chrome estilo macOS con URL `startcode://auth/login`
- Animaciones CSS en `App.css`: `pulseRing`, `fadeUp`, `blink`, `spin`, `spinR` para componentes del login
- Clase `grid-bg` en `App.css` — malla de líneas púrpura con máscara radial para fondo del login
- Estilos `input[type="checkbox"].chk` — checkbox custom con gradiente brand al activarse
- **`notification.service.ts`** — servicio singleton que envuelve Sonner (`toast.*`) para notificaciones in-app y `@tauri-apps/plugin-notification` para notificaciones nativas del SO
- **`NotificationContext.tsx`** — contexto global con preferencias de notificación, umbrales sincronizados con Monitoreo, `MetricWatcher` que detecta transiciones de estado (online→offline, normal→umbral) y dispara alertas automáticas, y funciones `testToast`/`testNative` para pruebas desde Settings
- Dependencias: `sonner` (toasts), `@tauri-apps/plugin-notification` (notificaciones nativas)
- Plugin Tauri `tauri-plugin-notification` registrado en `Cargo.toml`, `lib.rs` y `capabilities/default.json`
- **`Settings/Notificaciones`** — panel completamente funcional: cada toggle activo muestra botón "Probar", badge de canal (`In-app` / `Sistema`), aviso de permisos del SO para alertas de seguridad; thresholds se sincronizan con Monitoreo al guardar
- **`AppProviders.tsx`** — `NotificationProvider` montado dentro de `RealtimeMetricsProvider`; `<Toaster>` de Sonner con estilos glassmorphism (fondo `rgba(8,3,20,0.92)`, `backdrop-filter`)
- **`useInactivityLogout.ts`** — hook que escucha eventos del DOM (mouse, teclado, scroll) y llama `logout()` tras N minutos sin actividad; se desactiva cuando `minutes = 0`
- **`useSecuritySettings.ts`** — hook que persiste `sessionTimeout` y `passwordExpiration` en `localStorage`; helper `passwordAgeDays()` para calcular antigüedad de contraseña
- Campo `lastLogin` (`dat_last_login`) y `passwordChangedAt` (`dat_password_changed_at`) añadidos a la entidad `User` del backend
- `auth.service.ts` — actualiza `lastLogin = new Date()` en cada login exitoso; actualiza `passwordChangedAt = new Date()` al cambiar contraseña
- `buildAuthResponse` expone `twoFactorEnabled`, `lastLogin` y `passwordChangedAt` al frontend
- `auth.adapter.ts` / `auth.types.ts` — normalizan y tipan los nuevos campos

### Corregido
- **`Settings/Seguridad`** — el estado 2FA se inicializaba siempre como `false`; ahora `SecurityPane` lee `user.twoFactorEnabled` del contexto de auth y se sincroniza con `useEffect` cuando el usuario se recarga
- **`SecurityPane`** — refactorizado como componente autocontenido (sin props): gestiona 2FA, configuración de sesión y sesiones activas internamente usando `useAuth`, `useSecuritySettings`, `useTwoFactor*`
- Tiempo de inactividad efectivo: `InactivityWatcher` montado en `AppProviders` aplica el `sessionTimeout` guardado en cada inicio de app
- Indicador de expiración de contraseña: calcula días desde `user.passwordChangedAt` y muestra aviso/alerta según el umbral configurado
- Sesión activa muestra datos reales: SO y navegador parseados de `navigator.userAgent`, hora de último login de `user.lastLogin`

### Cambiado
- **`AppLayout.tsx`** — fondo moved a elemento `fixed inset-0 z-index:-1` separado para que `backdrop-filter` funcione correctamente en todos los paneles glass
- **`App.css`** — clases glass con `background-color` oscura explícita (`rgba(8,3,20,0.62)`) para garantizar apariencia dark independientemente del soporte de backdrop-filter; `saturate` aumentado a 200%; auroras con opacidad aumentada (0.72 base)
- **`ServerDetail.tsx`** — reescritura completa: eliminada dependencia `lucide-react`, iconos SVG inline, todos los paneles migrados a `.glass-soft/.glass`, botones a `.grad-brand`/`glass-soft`, tabs con `nav-active`, modal de instalación usa componente `Modal`
- **`ConectionLoading.tsx`** — eliminada dependencia `lucide-react`, rediseñado con sistema glass, pasos con states visuales (completado/activo/pendiente) usando iconos SVG inline
- **`Search.tsx`** (`SearchFilter`) — eliminada dependencia `lucide-react`, rediseñado con `glass-soft`, dropdown de filtros con `glass rounded-xl`, checkboxes con `.grad-brand`
- **`Loading.tsx`** — eliminado `bg-gray-50` y `border-blue-600`; spinner con colores brand (`violet-400`, `pink-400`) sobre fondo transparente
- **`NotFound.tsx`** — eliminada dependencia `lucide-react`, rediseñado con sistema glass; efecto glitch preservado; navegación con `useNavigate`
- **`Settings.tsx`** — `ProfilePane` con diseño de dos columnas (info/contraseña); `SystemPane` con grid 2 columnas para Sistema+DB; sliders de `SecurityPane` y `MonitoringPane` migrados a `RangeSlider`
- **`Login.tsx`** — eliminada dependencia `lucide-react`; reescritura completa con sistema de iconos SVG inline, hooks `useDrift`/`LiveSpark`, layout de dos paneles glassmorphism, botón con efecto shine sweep en hover
- **`auth.service.ts`** backend — métodos `updateProfile()` y `changePassword()` con bcrypt y validación de email único
- **`auth.adapter.ts`** — `normalizeUser()` unificado para manejar `firstname`/`lastname` del backend

### Corregido
- Icono `check` en `Dashboard.tsx` usaba path de globe incorrecto
- Propiedades de usuario `firstName`/`lastName` (camelCase) no existían; corregido a `firstname`/`lastname`/`name`
- Paneles glass aparecían "grises" por `backdrop-filter` borroneando un fondo incorrecto — corregido con capa base oscura explícita y fondo `fixed` separado
- Sliders nativos `input[type=range]` con apariencia inconsistente entre navegadores — reemplazados por `RangeSlider` en Security y Monitoring

---

## [0.2.0] — 2026-05-17

### Añadido
- Sistema de monitoreo en tiempo real vía WebSocket (gateway `AgentGateway`)
- Endpoint `POST /monitoring/agent-data` para recepción de métricas de agentes
- Entidad `AgentMetrics` con campos para CPU, memoria, disco, sitios web y bases de datos
- Migración SQL para nuevos campos `websites` y `databases` en `agent_metrics`
- Módulo de caché (`CacheModule`, `CacheService`) con TTL configurable
- Servicio `AgentDataService` para procesamiento y almacenamiento de datos de agente
- Servicio `ServerStatusService` para determinación de estado del servidor
- Contexto `RealtimeMetricsContext` en el frontend para métricas WebSocket en tiempo real
- Hook `useServerDetail` con polling cada 30s
- Seeder de usuario por defecto (`DefaultUserSeeder`)
- Panel de Configuración completo (`Settings.tsx`) con pestañas: Perfil, Notificaciones, Seguridad, Monitoreo, Sistema

### Cambiado
- Servicio SSH refactorizado para mejorar el manejo de errores de conexión
- `ServerCard` en Dashboard muestra métricas en tiempo real cuando el agente está conectado
- `AppLayout` incluye datos reales del servidor en la tarjeta de estado del sidebar
- Autenticación JWT con tokens de acceso y refresco

### Corregido
- Conexión SSH fallaba silenciosamente en timeout; ahora propaga el error correctamente

---

## [0.1.0] — 2026-05-10

### Añadido
- Inicialización del proyecto como monorepo (`FRONTEND/` + `BACKEND/`)
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router v6
- Backend: NestJS + TypeScript + TypeORM + PostgreSQL
- Autenticación con JWT (login, refresh token, 2FA TOTP)
- CRUD de servidores con conexión SSH via `node-ssh`
- Dashboard principal con lista de servidores y métricas básicas (CPU, RAM, Disco)
- Vista detalle de servidor con tabs: Resumen, Servicios, Sitios Web, Bases de Datos, Archivos
- Modal `AddServerModal` con validación de clave SSH privada y feedback visual
- Diseño glassmorphism oscuro (base: `#07050d`, gradiente púrpura-negro, auroras animadas)
- Estructura de diseño: clases `.glass`, `.glass-soft`, `.glass-input`, `.grad-brand`, `.nav-active`
- Página de error 404 con efecto glitch y terminal animada
- Ruta protegida con `ProtectedRoute` y redirección automática al login
- Soporte inicial para Tauri (configuración de ventana, `tauri.conf.json`)
