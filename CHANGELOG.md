# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

---

## [App de escritorio 0.11.0] — 2026-11-03

Versión **menor** sobre 0.10.0. Requiere el backend 0.12.1 (subida por partes y recuperación de la sesión SFTP).

### Añadido
- Vista previa en el explorador SFTP (`components/servers/sftp/SftpPreview.tsx`): un clic en una carpeta muestra lo que contiene sin entrar en ella (doble clic entra). Pulsar una de sus subcarpetas entra en la elegida y deja esa como la siguiente vista previa, así se construye la ruta viendo un nivel por delante. Un clic en un archivo muestra tamaño, permisos, fecha, propietario y ruta
- Sugerencias en la barra de ruta (`SftpPathBar.tsx`): al escribir se listan las carpetas de ese punto de la ruta (sin ocultas salvo que se escriba el punto); flechas para recorrerlas, Tab o Enter para añadir la resaltada y Enter sin resaltar para ir. Escape cierra solo las sugerencias
- Botón «Reintentar fallidos» en la cola de subidas, y cancelar también los archivos que siguen en cola
- Tamaño `2xl` del `Modal` (`max-w-[1400px]`), sin pasar nunca del ancho de la ventana

### Cambiado
- Rediseño del modal SFTP: alto fijo (`tall`) y tres columnas en una sola vista (carpeta actual, vista previa y subidas). Cada columna desplaza dentro, así lo que se carga ya no aparece debajo de la lista ni obliga a hacer scroll en el modal
- La lista de la carpeta usa una rejilla común para cabecera y filas (`SFTP_ROW_GRID`): nombre, tamaño, permisos y fecha quedan alineados con sus columnas. El filtro de ocultos sale de la cabecera de columnas a una barra propia con el recuento de carpetas y archivos

### Corregido
- Subidas SFTP que se caían a veces:
  - al elegir archivos con el diálogo, cada uno se leía entero en memoria (`readFile`) y con tres a la vez la app se quedaba sin memoria con archivos grandes. Ahora se leen por tramos (`PickedFile.slice`, plugin `fs` con `open`/`seek`/`read`);
  - un archivo iba en una sola petición, que el servidor HTTP corta a los 5 minutos y que un corte de red tiraba entera. Ahora va en partes de 8 MB, cada una con hasta 4 intentos ante cortes o errores del servidor; si al final falla o se cancela, el archivo a medias se borra del servidor;
  - si el socket de la sesión se cortaba un momento, el backend cerraba la sesión entre dos archivos de la cola y el resto fallaba. Ahora se reconecta a la misma sesión y la cola sigue; el estado muestra «Reconectando…»

---

## [0.12.1] — 2026-11-03

Versión **parche** del backend sobre 0.12.0. La app 0.11.0 la necesita para subir por SFTP.

### Corregido
- Subida SFTP por partes (`PUT sftp/sessions/:id/file` con `offset` y `total`): cada parte es una petición corta, así que no choca con el `requestTimeout` de Node (5 min) ni con el de un proxy. Solo se continúa un archivo que la misma sesión empezó y desde el byte confirmado (`SftpSession.partials`); una parte que falla deja el archivo como estaba antes de ella (`setstat` del tamaño) para reintentarla. Sin `offset`/`total` funciona como antes
- Evento `sftp:discard`: borra el archivo a medias de una subida abandonada, solo si es de la propia sesión. Al cerrar la sesión se borran los que queden
- La sesión SFTP sobrevive a un corte del socket: espera un minuto (`orphanedAt`) y el cliente la recupera al reconectar (`resume` en el handshake, `SftpSessionService.reattach`). Solo se cierra al momento cuando el cliente cierra el modal (`client namespace disconnect`) y no hay subidas en vuelo. Antes, el barrido la cerraba entre dos archivos de la cola y al reconectar se abría otra que la app ignoraba

---

## [App de escritorio 0.10.0] — 2026-10-20

Versión **menor** sobre 0.9.2. Requiere el backend 0.12.0 y StartCode Cloud 0.3.0 (para las miniaturas; con una versión anterior la nube sigue mostrando iconos).

### Añadido
- Túnel SSH en las conexiones a bases de datos (`ConnectionModal.tsx`, pestaña «Túnel SSH»): un interruptor lo activa y se elige entre un servidor ya dado de alta en el panel o credenciales SSH propias (host, puerto, usuario y contraseña o llave privada sin frase de paso). Con credenciales propias, la huella se lee sin autenticarse (`POST servers/host-key/scan`) y hay que confirmarla con el comando del servidor antes de guardar; si cambian el host o el puerto SSH, se pide de nuevo. Un servidor sin huella confirmada aparece marcado y no se puede usar hasta confirmarla en su detalle. La contraseña o llave guardada no vuelve a la app

### Cambiado
- Formulario de conexión en tres pestañas: Conexión (motor, nombre, etiqueta, host, puerto y credenciales), Base de datos y Túnel SSH. El cuerpo tiene un alto mínimo común para que el modal no salte al cambiar de pestaña, y al guardar con datos incompletos se abre la pestaña que los tiene
- Pestaña Base de datos: «Todas las bases de datos» por defecto (la conexión entra al servidor completo) o «Una base concreta»: sin desplegable, la lista de bases se pide al entrar en la pestaña (y al cambiar los datos de Conexión o del túnel), pulsar una la marca y arriba se indica «Base de datos seleccionada: nombre», con botón para recargar. Si al editar la base guardada no aparece en la lista, se muestra igual; guardar sin elegir base abre esta pestaña. En Redis sigue siendo el índice 0–15
- Tarjeta de conexión (`pages/databases/Databases.tsx`): las conexiones con túnel SSH muestran la píldora «Túnel SSH» en la cabecera del bloque Host; el `title` indica `usuario@host:puerto` del túnel con credenciales propias o que pasa por un servidor del panel
- Con el túnel activo, el campo de host queda deshabilitado en `127.0.0.1` (el motor visto desde el servidor SSH); al desactivarlo vuelve el host anterior
- Nube: imágenes y videos se muestran con su miniatura en lugar del icono del tipo (`components/cloud/FileThumb.tsx`), en el mosaico (a todo el ancho de la tarjeta, recortada) y en la lista (24 px). Los videos llevan encima el botón de reproducir con `.glass-media`. Se piden a `GET files/thumbnail` al entrar en pantalla (`IntersectionObserver`), como mucho 4 a la vez, y se recuerdan por archivo, tamaño y fecha (hasta 400); mientras cargan, o si no hay miniatura (formato no admitido, archivo dañado, Cloud anterior a 0.3.0), queda el icono

---

## [Cloud 0.3.0] — 2026-10-20

Versión **menor** de StartCode Cloud sobre 0.2.2. La app 0.10.0 la usa para las miniaturas del explorador.

### Añadido
- `GET files/thumbnail?section&path` (`files/thumbnail.service.ts`, `files/thumbnail-plan.ts`): miniatura de una imagen o portada de un video, con el lado mayor a 320 px y sin deformar. JPEG para fotos y videos y PNG para formatos con transparencia (PNG, GIF, SVG, WebP, ICO, AVIF). La portada sale del segundo 3 (salto por fotograma clave) o del primero si el video es más corto. 404 `NO_THUMBNAIL` si ffmpeg no puede leer el archivo
- ffmpeg a prioridad baja, 3 miniaturas a la vez como mucho, 20 s de límite cada una, y las peticiones iguales simultáneas comparten el trabajo. Sin ffmpeg, las imágenes que pinta el webview (PNG, JPEG, GIF, WebP, BMP, AVIF) de hasta 8 MB se envían tal cual
- Caché en disco por ruta, tamaño y fecha (`CLOUD_THUMB_CACHE_DIR`, por defecto `<CLOUD_DATA_DIR>/thumb-cache`), limitada por `CLOUD_THUMB_CACHE_BYTES` (1 GB) quitando lo menos visto; respuesta con `Cache-Control: private, max-age=86400`
- `mimeFromName` reconoce BMP y AVIF

---

## [0.12.0] — 2026-10-20

Versión **menor** del backend sobre 0.11.2. Requiere la app 0.10.0 para configurar el túnel desde la interfaz.

### Añadido
- Túnel SSH para las conexiones a bases de datos (`databases/services/database-tunnel.service.ts`):
  - modos `none`, `server` (un servidor del propio usuario, con su llave y su huella confirmada) y `custom` (credenciales propias con contraseña o llave, cifradas con `CredentialsCipherService`, y huella confirmada obligatoria);
  - cada túnel es un cliente ssh2 más un puerto local en `127.0.0.1`; los drivers (pg, mysql2, ioredis) se conectan a él y cada socket se reenvía con `forwardOut`. Se comparte entre la vista de consultas, el árbol y las pruebas mientras haya tráfico y se cierra tras un minuto sin conexiones;
  - el túnel pasa por `SSHService` (`openTunnelClient`), con la misma verificación de huella que el resto de conexiones SSH: sin la confirmada no se envía ninguna credencial. `SSHTarget` admite contraseña para estos túneles;
  - se abre al conectar (`ProbeTarget.tunnel`, `endpointOf` en `connection-factory.ts`), así que la sesión de consultas lo vuelve a abrir si se cerró;
  - errores en español: credenciales SSH incorrectas, host SSH inalcanzable, llave no válida o con frase de paso, y motor que no escucha en el destino desde el servidor SSH
- `POST databases`, `PATCH databases/:id`, `POST databases/test` y `POST databases/schemas` aceptan `sshMode`, `sshServerId`, `sshHost`, `sshPort`, `sshUsername`, `sshAuth`, `sshSecret`, `sshHostKeyFingerprint` y `sshHostKeyAlgorithm`. Las respuestas devuelven los datos del túnel y `hasSshSecret`, nunca el secreto. En una edición, `sshSecret` omitido conserva el guardado (si no cambia el tipo de autenticación); otro host o puerto SSH sin huella nueva la borra. Cambiar de modo borra los datos del anterior y cierra las sesiones abiertas de la conexión

### Base de datos
- Migración `add_ssh_tunnel_to_database_connections.sql` (idempotente): columnas `enu_ssh_mode` (por defecto `none`), `str_ssh_server_id` (FK a `tbl_servers`, `ON DELETE SET NULL`), `str_ssh_host`, `int_ssh_port`, `str_ssh_username`, `enu_ssh_auth`, `str_ssh_secret_enc`, `str_ssh_host_key_fingerprint` y `str_ssh_host_key_algorithm` en `tbl_database_connections`

---

## [App de escritorio 0.9.2] — 2026-10-20

Versión **parche** sobre 0.9.1. Requiere el backend 0.11.2.

### Seguridad
- Alta de servidor (`AddServerModal.tsx`): antes de crear el servidor, la app lee su clave de host (`POST servers/host-key/scan`, sin enviar la llave privada) y la muestra con el comando para comprobarla en el servidor (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Solo al confirmar «Coincide» se crea el servidor con esa huella fijada
- Primera conexión sin huella confirmada (servidores anteriores o con host o puerto cambiados): `HostKeyMismatchModal.tsx` reconoce el 409 `HOST_KEY_UNVERIFIED` y pide confirmar la huella presentada, con el mismo flujo de dos pasos que el cambio de huella. La fila «Clave de host» del detalle indica «Sin confirmar» hasta entonces
- Agente (`AgentCard.tsx`): si su token es de un agente anterior a 2.2.0, la tarjeta avisa de la fecha en que deja de valer y pide reinstalarlo

### Cambiado
- Instaladores en español (`tauri.conf.json`): el MSI se genera en `es-ES` y el instalador NSIS en español, sin selector de idioma. El paquete de macOS declara el español como idioma de la app (`src-tauri/Info.plist`). Editor, descripción corta y larga de los paquetes en español

---

## [0.11.2] — 2026-10-20

Versión **parche** del backend sobre 0.11.1. Requiere la app 0.9.2 para confirmar huellas desde la interfaz.

### Seguridad
- Clave de host SSH sin confianza a ciegas (`monitoring/services/host-key.ts`, `ssh.service.ts`):
  - ninguna conexión se autentica contra un servidor sin huella confirmada; responde 409 `HOST_KEY_UNVERIFIED` con la clave presentada (también por los sockets de terminal y SFTP) y no se envía ninguna credencial;
  - `POST servers/host-key/scan` (`{ host, port }`, 10 por minuto) lee la clave sin autenticarse para enseñarla en el alta; la huella confirmada se manda en `POST servers`;
  - `POST servers/:id/host-key/accept` sirve también para la primera confirmación, que exige la huella que vio el usuario (`fingerprint`); queda en las notificaciones de seguridad como «Clave de host confirmada»;
  - `HostKeyError` agrupa `HostKeyMismatchError` y `HostKeyUnverifiedError`; la instalación del agente y la prueba de conexión los dejan pasar tal cual;
  - `SSHService` ya no escribe en la base de datos (se quitó el TOFU)
- Tokens heredados de agentes (anteriores a 2.2.0, sin `jti`): dejan de valer en la fecha de `AGENT_LEGACY_TOKEN_CUTOFF` (por defecto `2026-12-01T00:00:00Z`), estén o no fijados por su huella. Un servidor apagado ya no conserva su token de 365 días. El agente recibe `AGENT_TOKEN_REJECTED` con el motivo `legacy_expired` y el estado del agente (`GET servers/:id/agent`) devuelve `tokenLegacyUntil` para avisar en la interfaz. Una fecha pasada en la variable los corta al reiniciar

### Configuración
- Nueva variable `AGENT_LEGACY_TOKEN_CUTOFF` (ISO 8601). Una fecha no válida usa la de por defecto

---

## [App de escritorio 0.9.1] — 2026-10-19

Versión **parche** de seguridad sobre 0.9.0. Requiere el backend 0.11.1.

### Seguridad
- `src-tauri/src/cloud_download.rs`: el comando `cloud_download` valida sus argumentos antes de tocar la red o el disco (`validate()`): `id` alfanumérico de hasta 64 caracteres, URL http(s) con host, token de una línea de hasta 8 KB y `dest` absoluto, que no sea carpeta y dentro del ámbito de `fs` (solo lo elegido en el diálogo de guardar). Antes aceptaba cualquier ruta: un XSS podía escribir o, con una descarga fallida, borrar cualquier archivo del usuario. Si la validación falla no se borra nada
- `src-tauri/src/macos_notify.rs`: título y cuerpo de la notificación recortados a 256 y 4096 caracteres
- `src-tauri/capabilities/default.json`, privilegio mínimo:
  - `core:default` pasa a ser solo app, event, path, window, webview y resources;
  - notificaciones: solo `is-permission-granted`, `request-permission` y `notify`;
  - `opener` solo abre direcciones `http://` y `https://`
- `src-tauri/tauri.conf.json`: la CSP añade `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'`, `font-src 'self' data:` y `worker-src 'self' blob:`
- Enlaces externos (`lib/openExternal.ts`): solo se abren direcciones http(s) comprobadas con `new URL`. Lo usan `MarkdownView.tsx` y `InstallServiceModal.tsx`; el enlace de acceso que imprime el servidor ya no se abre sin validar
- Cerrar sesión limpia siempre los tokens y la caché de react-query, aunque falle la petición (`AuthProvider.tsx`), y también cuando falla la renovación de sesión (`api.service.ts`)
- Cambiar la contraseña (Configuración y contraseña caducada en `Login.tsx`) valida en el cliente la misma política que el backend: de 8 a 72 caracteres, con mayúscula, minúscula, número y un carácter especial. Configuración muestra el requisito de minúscula
- Dependencias actualizadas sin cambiar de versión mayor (`pnpm audit --prod`: de 63 vulnerabilidades a 2): axios 1.20.0, react-router-dom 6.30.6, socket.io-client 4.8.4, vite 7.3.7 y las transitivas (form-data, follow-redirects, lodash, nanoid, picomatch, postcss, rollup, source-map-js, socket.io-parser, ws). Quedan 2 moderadas de react-router que solo se corrigen en la v7 y aquí no se pueden explotar: todas las navegaciones usan rutas fijas y la app no usa el modo framework
- Descarga de la nube (`cloud_download.rs`): ya no sigue redirecciones, así el token de la nube no sale hacia otro servidor
- Huella SSH:
  - el detalle del servidor muestra su clave de host (fila «Clave de host»);
  - si la huella no coincide con la guardada (por HTTP, terminal o SFTP, `lib/hostKeyAlert.ts`), `HostKeyMismatchModal.tsx` avisa de un posible ataque de intermediario, muestra la huella esperada y la recibida, y ofrece «Aceptar nueva huella» (con confirmación) o «Cancelar»
- Si el backend cierra la sesión por reutilizar un token de renovación (401 `REFRESH_REUSED`), `api.service.ts` lo pasa a `sessionRevoked` y el login muestra el motivo, sin recargar la página
- Sesión revocada (`lib/sessionRevoked.ts`): al recibir `auth:revoked` por cualquier socket, la app borra los tokens y la caché, cierra la terminal minimizada, deja de reconectar las métricas y vuelve al login con el motivo en un aviso ámbar. Un corte de red normal sigue reconectando
- Agente (`AgentCard.tsx`):
  - «Regenerar token», con confirmación: si el agente está conectado lo rota, y si no lo revoca y ofrece «Reinstalar agente»;
  - la tarjeta muestra la edad del token o «rotando token»

---

## [0.11.1] — 2026-10-19

Versión **parche** de seguridad sobre 0.11.0.

### Seguridad
- Autenticación:
  - `POST /auth/register` responde 403 salvo con `AUTH_ALLOW_REGISTRATION=true`. La app no lo usa
  - Login sin enumeración de cuentas: compara siempre contra un hash bcrypt, aunque el email no exista; «usuario inactivo» solo lo ve quien acierta la contraseña, y el bloqueo y sus mensajes son iguales para emails existentes e inexistentes
  - Fuerza bruta (`auth/login-attempts.ts`, en memoria):
    - por cuenta, 5 fallos en 15 minutos bloquean 15 minutos, con retardo creciente;
    - por IP, 30 fallos en 15 minutos dan 429;
    - en la renovación de sesión, límites por IP y por usuario.
    La IP sale de `req.ip`, no de `X-Forwarded-For`
  - DTO estrictos (`RawValue`): un objeto o array en un campo de texto ya no se convierte en `"[object Object]"`. Topes de longitud en email, contraseña y tokens, y formato JWT en `tempToken` y `refreshToken` (`RefreshTokenDto`)
  - JWT (`auth/jwt-config.ts`):
    - al arrancar, `JWT_SECRET` debe tener al menos 32 caracteres y no ser el de ejemplo;
    - algoritmo fijo HS256 al firmar y al verificar;
    - el hash del refresh se compara en tiempo constante;
    - los sockets rechazan las sesiones caducadas.
  - Política de contraseña (`auth/dto/password-policy.ts`): de 8 a 72 caracteres, con mayúscula, minúscula, número y símbolo, en el registro, el cambio de contraseña y el cambio de contraseña caducada. En producción, el seeder no crea el administrador inicial con una contraseña débil o de ejemplo
- Arranque (`main.ts`):
  - helmet, con CSP estricta en producción, y sin `x-powered-by`;
  - límite del cuerpo con `BODY_LIMIT` (100kb por defecto) y `TRUST_PROXY` opcional;
  - Swagger desactivado en producción;
  - CORS (`adapters/cors-origins.ts`): en producción se ignora `CORS_ORIGIN=*` y solo quedan los orígenes configurados y los de Tauri
- Control de acceso:
  - el namespace `/agent` autentica la conexión del panel con `WsAuthService`: un token de una sesión cerrada o revocada, o de un usuario desactivado, ya no recibe métricas ni notificaciones, y la sala sale del usuario del token;
  - `:id` de servers, servers/agent y agent-data con `ParseUUIDPipe`: un id inválido da 400 en vez de 500;
  - terminal y SFTP validan el `serverId` como UUID antes de consultar;
  - nuevo `app.access-control.spec.ts`: recorre todas las rutas y comprueba que sin token válido, o con token caducado, de otro tipo, de otra sesión o revocado, solo responden las públicas
- Comandos por SSH (`common/security/shell.ts`):
  - un solo `shellQuote`, usado también por las recetas, los comandos y la instalación del agente;
  - `assertUnitName` impide que una unidad que empiece por `-` se lea como opción de systemctl o journalctl, y los comandos llevan `-- 'unidad'`;
  - acción validada contra el enum y tope en el PID
- Recetas de instalación: `isInstallable` e `isInstallGroup` usan `Object.hasOwn` (`toString` ya no pasa) y se sanean `codename`, `version`, `arch` y el gestor de paquetes que reporta el servidor
- Hosts y puertos (`common/security/network.ts`):
  - `@IsHost`, puerto entero y usuario SSH que no empiece por `-` en los DTO de servidor y de conexión;
  - llave privada de hasta 32 KB;
  - comprobación también al conectar (`ssh.service.ts`, `connection-factory.ts`, `database-probe.service.ts`);
  - `panelUrl` del agente debe ser http(s) sin credenciales
- Bases de datos:
  - `runQuery` de MySQL y PostgreSQL lee fila a fila y guarda solo `MAX_ROWS`: un `SELECT` enorme ya no agota la memoria;
  - MySQL: identificadores con punto bien escapados (`quoteMysqlId`), valores objeto o array rechazados (`toMysqlParam`) y `LOCAL_FILES` desactivado;
  - `query-policy.ts`: los comentarios ejecutables de MySQL (`/*! … */`, `/*M! … */`) cuentan como SQL, y `DO` y `PREPARE` piden confirmación;
  - `redis-policy.ts`: `EVAL`, `EVALSHA`, `FCALL`, `SCRIPT LOAD` y `FUNCTION LOAD` piden confirmación
- SFTP:
  - un `SFTP_MAX_UPLOAD_BYTES` inválido vuelve al tope de 2 GiB en lugar de quedar sin límite;
  - se rechaza antes de abrir nada si el tamaño declarado supera el tope;
  - `mkdirp` admite hasta 10 000 carpetas por lote;
  - rutas sin el carácter DEL y con tipos validados
- Asistente IA: `secret-redactor.ts` oculta además cabeceras `Authorization`/`Bearer`, `curl -u`, JWT y claves de AWS, GitHub, GitLab y Slack, y el estado del panel y los destinos pasan por `hidePanelInternals`
- Huella SSH (TOFU, `monitoring/services/host-key.ts`):
  - todas las conexiones ssh2 (terminal, SFTP, comandos, monitorización, Docker, Kubernetes, instalación de servicios y del agente) pasan por un único `open()` en `ssh.service.ts` con `hostVerifier`;
  - la primera conexión guarda el algoritmo y la huella `SHA256:…` al quedar autenticada, con un UPDATE condicionado a que siga vacía;
  - si no coincide, responde 409 `HOST_KEY_MISMATCH` con la huella esperada y la recibida, y también por `terminal:error` y `sftp:error`;
  - `POST servers/:id/host-key/accept` (solo el dueño) vuelve a leer la clave sin autenticarse y la reemplaza. Si la huella que vio el usuario ya no es la actual, responde 409 `HOST_KEY_CHANGED`. Queda en una notificación de seguridad;
  - cambiar el host o el puerto borra la huella guardada;
  - columnas `hostKeyAlgorithm`, `hostKeyFingerprint` y `hostKeyVerifiedAt` (migración `add_host_key_to_servers.sql`)
- Sockets y sesión (`auth/session-sockets.service.ts`):
  - registro sesión → sockets: al revocar una sesión (logout, cerrar una u otras sesiones, cambio de contraseña, tope de sesiones, inactividad por HTTP) su terminal, su SFTP y su conexión a `/agent` reciben `auth:revoked` con el motivo y se cortan; la terminal cierra su SSH. Los sockets de las demás sesiones siguen abiertos;
  - un barrido cada 30 s corta los sockets de sesiones caducadas, inactivas o de usuarios desactivados;
  - cuentan como actividad abrir la terminal o el SFTP, escribir en la terminal y cada operación de SFTP. No cuentan el cambio de tamaño ni lo que empuja el servidor (métricas, avisos). La actividad renueva `lastUsed` como máximo una vez por minuto, así una terminal en uso no caduca por falta de peticiones HTTP
- Tokens del agente (`servers/services/agent-token.service.ts`):
  - duran 30 días (`AGENT_TOKEN_EXPIRES_IN=30d`, antes 365d) y llevan un `jti` que se guarda en el servidor: solo vale el vigente. Reinstalar, desinstalar, borrar el servidor o pedir un token nuevo invalidan el anterior;
  - rotación automática a los 7 días por el socket ya autenticado (`agent:token:rotate`): el nuevo queda pendiente hasta el `agent:token:ack`, o hasta que el agente lo usa (ACK perdido). El anterior se acepta 10 minutos más;
  - los tokens antiguos sin `jti` se aceptan una vez, se fijan por su sha256 y se rotan al esquema nuevo;
  - un token rechazado recibe `AGENT_TOKEN_REJECTED` y se corta el socket. Un fallo de la base no cuenta como rechazo;
  - `POST servers/:id/agent/token` (solo el dueño) regenera el token: si el agente está conectado lo rota, y si no lo revoca. Queda en una notificación de seguridad. `GET servers/:id/agent` devuelve `tokenIssuedAt` y `tokenRotating`;
  - columnas en `servers` (migración `add_agent_token_revocation_to_servers.sql`)
- Agente 2.2.0-go (en `agent-dist`):
  - guarda el token rotado de forma atómica (archivo temporal 0600, fsync y rename) antes de confirmarlo;
  - relee el token del disco en cada intento de conexión, así vuelve con el token vigente o con el rotado;
  - tras un 401 espera 30 minutos, comprobando cada 30 s si cambió el token del disco;
  - reconoce el cierre del namespace por parte del panel;
  - la unidad de systemd permite escribir en `/etc/startcode-agent`.
  Los agentes anteriores siguen funcionando con su token pero no rotan hasta reinstalarlos
- Reutilización del refresh token (`auth.service.ts`):
  - cada rotación guarda el hash del anterior y cuándo se rotó, con un UPDATE condicionado al hash leído; si dos renovaciones se cruzan, la que pierde recibe 401 sin revocar nada;
  - el anterior se acepta 30 s más (`REFRESH_REUSE_GRACE_MS`) para cubrir una respuesta perdida por la red, sin alargar la ventana;
  - pasado ese margen, o con cualquier otro refresh ya rotado de la sesión, se revoca la sesión entera. Sus sockets reciben `auth:revoked` con el motivo `reuse`, la respuesta es 401 `REFRESH_REUSED` y queda una notificación de seguridad con la IP y el dispositivo;
  - columnas `str_previous_refresh_hash` y `dat_refresh_rotated_at` en `tbl_sessions` (migración `add_refresh_reuse_to_sessions.sql`)
- Migraciones a aplicar antes de levantar la API: `add_host_key_to_servers.sql`, `add_agent_token_revocation_to_servers.sql` y `add_refresh_reuse_to_sessions.sql`
- Pruebas contra el backend en marcha:
  - `GET /servers/filter/status/:status`, `GET /servers/filter/os/:os` y `PATCH /servers/:id/status` con un valor fuera del enum daban 500; ahora usan `ParseEnumPipe` y dan 400
  - `DELETE /databases/:id/sessions/:sessionId` respondía 200 con una conexión ajena, aunque no cerraba la sesión. Ahora valida el UUID, comprueba que la conexión es del usuario (404 si no) y solo cierra la sesión si es de esa conexión
  - Un JSON muy anidado de unos 10 KB daba 500 incluso en el login. `common/security/body-depth.ts` rechaza con 400 los cuerpos de más de 64 niveles
- `docker/postgres/initdb/01-schema.sql` regenerado con las columnas nuevas
- Variables nuevas en `.env.production.example`:
  - `TRUST_PROXY`, obligatoria detrás de un proxy inverso para que el límite por IP no sea global;
  - `BODY_LIMIT`;
  - `AUTH_ALLOW_REGISTRATION`
- Dependencia nueva: `helmet` 8.3.0
- Dependencias actualizadas sin cambiar de versión mayor (`pnpm audit --prod`: de 54 vulnerabilidades, una crítica, a 0):
  - NestJS 11.2.7, `@nestjs/swagger` 11.4.7, typeorm 0.3.31 (inyección SQL en UpdateQueryBuilder), socket.io 4.8.4 y class-validator 0.14.4;
  - por dependencias transitivas: proxy-addr (crítica, la IP de `trust proxy` que alimenta el bloqueo por fuerza bruta), engine.io, socket.io-parser y ws (DoS en los WebSocket), qs, body-parser y path-to-regexp (DoS en HTTP), jws, multer, validator y lodash;
  - override de `js-yaml` 5.4.2 bajo `@nestjs/swagger`, en `pnpm-workspace.yaml`, porque pnpm 12 ya no lee el campo `pnpm` de `package.json`.
  En desarrollo quedan `braces` y `sprintf-js` (jest y typescript-eslint), que no tienen versión corregida

---

## [Cloud 0.2.2] — 2026-10-19

Versión **parche** de seguridad sobre 0.2.1. Sin variables de entorno nuevas.

### Seguridad
- **Crítico: aislamiento entre usuarios.** Antes, los usuarios sin rutas propias compartían las carpetas Home y Backups por defecto, y cualquiera podía apuntar las suyas (`PUT /config/paths`) a las de otro, así que un usuario podía leer, listar y borrar archivos ajenos. Ahora:
  - al arrancar, `state.store.ts` asigna a cada usuario sin rutas `<raíz>/users/<usuario>/{home,backups}`, con `paths/user-paths.ts`;
  - la carpeta compartida de antes solo se la queda el usuario más antiguo, y solo si nadie tiene rutas todavía;
  - `get()` devuelve 403 si un usuario no tiene rutas, en vez de caer en las compartidas;
  - `set()` rechaza una carpeta igual a la de otro usuario, dentro de ella o por encima. Lo comprueba con el texto de la ruta, con realpath y otra vez justo antes de guardar. También rechaza `users`, salvo la carpeta propia, y la carpeta de datos internos.
  En una instalación con varios usuarios que ya compartían carpeta, los demás empiezan con carpetas vacías: hay que repartir los archivos a mano.
- Enlaces simbólicos (`files/path-guard.ts`):
  - la raíz de cada sección debe estar, ya resuelta con realpath, dentro de `CLOUD_ALLOWED_ROOTS` (`assertRootAllowed`);
  - toda operación comprueba que la ruta real sigue dentro de la sección (`assertInsideRoot`);
  - leer y reproducir abren el archivo con `O_NOFOLLOW`.
  Un enlace hacia fuera da 403 y no aparece en el árbol ni en el zip
- Subidas:
  - exigen `application/octet-stream` (415 si no); antes, una subida en JSON o formulario llegaba vacía y pisaba el archivo;
  - responden 413 sin leer el cuerpo si el tamaño declarado supera el máximo, y 507 si no queda espacio en disco
- `common/http-hardening.ts`: una petición tiene 60 s para enviar el cuerpo completo, y una subida se corta tras 120 s sin recibir datos. Antes `requestTimeout = 0` permitía retener conexiones (slowloris) sin sesión. Las descargas lentas no se cortan
- La reproducción solo admite vídeo y audio (`isStreamable`), tanto al emitir el ticket como al usarlo. Antes se podía servir un SVG o un HTML en línea
- Cabeceras en todas las respuestas: `nosniff`, CSP `default-src 'none'; sandbox`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store` (la reproducción mantiene su caché). Sin `x-powered-by`
- JWT: solo se acepta HS256 al verificar. El hash de relleno del login se calcula al arrancar, así que el primer intento con un usuario inexistente no tarda distinto
- CORS (`common/cors-origins.ts`): con `CORS_ORIGIN` vacío, antes `*`, ahora solo se admite la app de escritorio; en producción con `*` sale un aviso
- Renombrar un archivo cambiando solo mayúsculas ya no pisa otro archivo que exista con ese nombre: devuelve 409
- Los nombres de archivo con caracteres de control o de dirección (como U+202E, que disfraza la extensión) se rechazan
- Los árboles que un usuario pide a la vez para la misma sección comparten un solo recorrido. El zip tiene un tope de `CLOUD_TREE_MAX_ENTRIES × 10` elementos (413) y no sigue enlaces

---

## [App de escritorio 0.9.0] — 2026-10-19

Versión **menor** sobre 0.8.0.

### Añadido
- Terminal minimizada (`contexts/TerminalDockContext.tsx`, `hooks/useTerminalDock.ts`): la terminal deja de vivir en el detalle del servidor y la monta `TerminalDockProvider` en `AppLayout`, así sus sesiones SSH (todas las pestañas) siguen abiertas al ir a otra vista. Cerrar la ventana la minimiza: fuera del detalle de su servidor aparece una barra flotante abajo a la derecha (`glass-float`, se corre a la izquierda del asistente si está abierto) con el estado, el servidor y el número de terminales; un clic la vuelve a abrir sobre la vista actual (p. ej. Bases de datos) y la x termina todas las sesiones. Una sola terminal a la vez: entrar al detalle de otro servidor cierra la minimizada (`useTerminalDockViewing`). Cerrar sesión en la app también las cierra
- Bases de datos: gestión de Redis (`components/databases/redis/`), que antes mostraba «llega pronto». La vista de la conexión abre su sesión y muestra, arriba, las claves (30 %) y el valor (70 %) y, abajo, la consola:
  - Claves (`RedisBrowser.tsx`): selector de base (db0–db15 con su número de claves), filtro por tipo y buscador (sin comodines busca «contiene»; con `*`/`?` usa el patrón tal cual, con 350 ms de espera), lista por páginas con «Cargar más», tipo y caducidad de cada una, «Nueva» y, al pie, claves de la base, memoria usada / límite, clientes y si es réplica.
  - Valor (`RedisValuePanel.tsx`): nombre, tipo, tamaño, memoria y caducidad (cambiarla o quitarla), copiar el nombre, renombrar y borrar (con confirmación; queda en la auditoría). Texto con editor (Ctrl + S guarda y conserva la caducidad; «Formatear JSON» si lo es); hash, lista, conjunto, conjunto ordenado y stream en tablas con edición en línea (doble clic o lápiz), quitar y agregar al pie (lista al inicio o al final; stream con campo=valor por línea). Si el valor viene recortado lo avisa, y un texto recortado queda de solo lectura.
  - Consola (`RedisConsole.tsx`): comandos como en redis-cli sobre la base elegida, respuesta con su formato (`(nil)`, `(integer)`, listas numeradas), historial con ↑/↓, Ctrl + L o `clear` limpian, y confirmación para los peligrosos. El asistente lee las últimas respuestas y puede dejar un comando escrito, sin ejecutarlo. Tras un comando que escribe se refrescan la lista y el valor.
  - Clave nueva (`RedisNewKeyModal.tsx`): nombre, tipo, su primer valor y caducidad opcional.
  - `MANAGEABLE_ENGINES` incluye Redis y `SQL_ENGINES` separa lo que usa árbol y editor SQL. Requiere el backend 0.11.0
- Asistente IA: comando `/clear` (`AssistantPanel.tsx`). Limpia solo la vista del chat: la conversación sigue en el backend como contexto y memoria (no se resume ni se borra). Se guarda en el equipo (`assistant_cleared:<id del usuario>`) la fecha, del servidor, del último mensaje visto, y solo se muestran los posteriores; la pregunta en vuelo se ve siempre. Aparece en la lista de comandos junto a `/resume` y «Limpiar caché» lo conserva

### Cambiado
- Asistente IA: cada fuente de la pantalla se adjunta con un tope de 12 000 caracteres (antes 30 000), lo más reciente, para gastar menos tokens. Los bloques ```redis solo se ofrecen para pegar en la consola de Redis, y la consola de Redis no recibe bloques de shell ni SQL
- El botón de la esquina de la terminal pasa de x («Ocultar») a «Minimizar»
- Barra lateral: el logo del título es el icono de la app (`public/icono-oscuro-180.png`, 180 px para que se vea nítido en pantallas 2x y 3x) en lugar del icono genérico de servidor. Se muestra a 36 px tal cual, con sus propias esquinas
- Configuración → Sistema: el logo de StartCode encabeza la pestaña, a 112 px de alto. Según el tema: `public/logo-fondo-claro-1200.png` en Solar y `public/logo-fondo-oscuro-1200.png` (llaves en blanco) en Nocturno y Aurora; ambos 1200×600 con fondo transparente
- Código sin errores de ESLint ni de TypeScript (había 339). El cliente HTTP (`services/api.service.ts`) tipa las respuestas (`ApiResponse<T>`), lo que elimina casi todos los `any`. Hay tipos para el payload del agente (`RawAgentMetrics` en `useServerDetail.ts`) y para las respuestas de autenticación (`RawBackendUser`, `RawAuthPayload`). Los contextos de métricas en tiempo real, notificaciones y preferencias separan tipos y hooks (`contexts/*-context.ts`, `hooks/useRealtimeMetrics.ts`, `useNotifications.ts`, `usePreferences.ts`), así el refresco en caliente funciona. Sin cambios de comportamiento
- Compilación (`.github/workflows/desktop-build.yml`): macOS se compila una sola vez como binario universal (`--target universal-apple-darwin`, Intel y Apple Silicon en el mismo .app y .dmg) en lugar de dos jobs. Un minuto de macOS gasta 10 de la cuota de Actions, así que esto ahorra la mitad de lo que gastaba macOS. `build-update-site.mjs` publica el mismo paquete de actualización en `darwin/aarch64` y `darwin/x86_64`, que es lo que piden las apps ya instaladas. La ejecución manual ofrece `all`, `windows`, `linux` y `macos`

### Corregido
- Configuración → seguridad: «Copiar códigos» de respaldo dejaba una promesa rechazada sin manejar si el portapapeles fallaba
- Cerrar sesión desde la barra lateral: la promesa de `logout()` quedaba sin `void` en el manejador del clic

---

## [App de escritorio 0.8.0] — 2026-10-15

Versión **menor** sobre 0.7.1.

### Añadido
- Terminal del detalle del servidor con pestañas (`components/servers/ServerTerminal.tsx`): hasta 5 (`MAX_TABS`) en el mismo modal, «Terminal #» con el número libre más bajo. Cada pestaña es un `TerminalPane` con su xterm y su socket `/terminal`, es decir, su propia conexión SSH; todas quedan montadas y la inactiva solo se oculta, así conserva la sesión y el búfer. Las pestañas son lengüetas de la propia consola: la activa tiene su fondo y se une a ella sin borde (con curvas inversas en los pies), las inactivas quedan sobre el cristal del modal. El texto y la x de la activa usan la paleta fija de la terminal (`THEME.foreground`), porque `text-white` es tinta oscura en los temas claros y no se leía sobre la consola. Cada pestaña muestra el estado de su conexión; la x cierra solo esa conexión (en las inactivas aparece al pasar el mouse) y cerrar la última cierra la terminal; el + desaparece al llegar a 5
- Editores SQL guardados en el equipo (`lib/sqlEditors.ts`, `localStorage` con la clave `sql_editors:<id de la conexión>`): por conexión, las pestañas (número, nombre y texto) y la activa. Se guardan 500 ms después del último cambio y lo pendiente al salir de la vista o al cerrar la app (`pagehide`); al abrir la conexión se restauran. No se guardan los resultados ni el historial de deshacer. Una sola pestaña vacía no ocupa espacio. Se borran al eliminar la conexión y «Limpiar caché» de Configuración los conserva. `DatabaseDetail` se monta con `key` por conexión, para que pasar de una base a otra no mezcle sus editores. Ojo: el texto SQL queda guardado tal cual en el equipo
- Resultados: celda marcada (`ResultGrid.tsx`). Un clic la marca (`.cell-active`, borde y fondo de marca) y quita la selección de filas; Ctrl/⌘ + C o el botón «Copiar valor» copian su valor tal cual, sin comillas de TSV. Una NULL no se copia y una columna oculta pide mostrarla antes, para no copiar la máscara. Las flechas la mueven (con `scrollIntoView`), Enter la edita y Escape la desmarca. Las celdas (también las de filas nuevas) usan `cursor-pointer` en lugar del de texto, salvo la que se está editando. Si hay texto seleccionado con el mouse, Ctrl + C copia ese texto
- Asistente IA: comando `/resume` (`AssistantPanel.tsx`). No se envía al modelo: llama a `POST /assistant/memory/summarize` (backend 0.10.0), que resume toda la conversación en la memoria y la vacía; un aviso dice cuántos mensajes se resumieron. Mientras se escribe `/…` aparece la lista de comandos (clic o Tab completa) y, mientras resume, «Resumiendo la conversación en la memoria…». Sin conversación avisa y no hace nada
- Servidores favoritos (`pages/servers/Servers.tsx`): clic derecho en una tarjeta o fila abre su menú con «Marcar como favorito» / «Quitar de favoritos», «Editar» y «Eliminar». Hasta 3 (`MAX_FAVORITES`): con 3 marcados la opción sale desactivada como «Favoritos completos (3)». Los favoritos van primero, por orden de marcado, también con búsqueda y filtros, y llevan una estrella de marca junto al nombre. El cambio se aplica al instante (`useSetServerFavorite`, optimista) y vuelve atrás si el backend lo rechaza. Iconos `star`, `unstar` y `edit` en `MenuIcon`. Las tarjetas y filas ya no llevan los botones de editar y eliminar (`RowActions` eliminado): están en el menú. Requiere el backend 0.10.0
- Editar servidor: enlace «Cambiar llave privada» (`EditServerModal.tsx`). Al pulsarlo aparece el campo de la nueva llave con el indicador de válida o inválida; «Cancelar» lo vuelve a ocultar. Al guardar, primero los datos y después la llave (`PUT /servers/:id/private-key`, `useUpdateServerKey`), que el backend 0.10.0 guarda cifrada. La actual nunca se muestra (la API no la devuelve). La validación y la normalización de saltos de línea pasan a `utils/servers.ts` (`validateKey`, `normalizeKey`), compartidas con el alta

### Cambiado
- Limpiar, el estado de la cabecera y el asistente (leer y escribir) actúan sobre la pestaña activa. «Terminar sesión» pasa a «Terminar todas» con más de una pestaña. Cada pestaña abre su socket con `forceNew`, sin compartir el Manager de socket.io, así cerrarla corta su websocket y el backend cierra su SSH. Requiere el backend 0.10.0 para cerrar también las que se cierran mientras conectan
- Bases de datos: las pestañas del editor SQL pasan a llamarse por defecto «Editor #» (antes «Consola #»). «Agregar editor», «Cerrar editor» y el campo de renombrar cambian igual; los nombres puestos por el usuario se conservan
- Agregar servidor (`AddServerModal.tsx`) y conexión a base de datos (`ConnectionModal.tsx`): la etiqueta va en la misma fila que el nombre, en proporción 85/15 (`grid-cols-[minmax(0,85fr)_minmax(8.5rem,15fr)]`; la etiqueta no baja de 8,5 rem para que se lea «Sin etiqueta» o «Desarrollo»). En pantallas estrechas vuelven a ir una debajo de otra. El texto de ayuda de la etiqueta pasa a un `title`
- Editor SQL: margen derecho para que el final de una línea larga no quede pegado al borde. Es un borde transparente de 32 px (20 de margen más la franja de la barra) en el textarea y en el resaltado, y no padding: el `padding-right` de un textarea no cuenta en su desplazamiento horizontal. `placeCaret` ya no suma la franja, porque `clientWidth` no incluye el borde

### Corregido
- Portapapeles (`lib/clipboard.ts`): copiar daba «No se pudo copiar al portapapeles». `copyText` usaba solo el plugin de Tauri (arboard), que en Linux con Wayland escribe en el portapapeles de X11 y puede fallar o no llegar. Ahora copia primero con el del webview (un textarea fuera de pantalla y `execCommand('copy')`, síncrono, dentro del gesto de la tecla o el clic, que es lo que piden WebKitGTK, WKWebView y WebView2), devuelve el foco y la selección, y deja el plugin de respaldo. Afecta a todos los «Copiar» de la app
- Editor SQL: `placeCaret` también mueve la vista en horizontal, solo lo justo para que se vea el cursor. Antes conservaba el desplazamiento horizontal: tras Enter al final de una línea larga, la fila nueva quedaba fuera de la vista con el cursor a la izquierda

---

## [0.11.0] — 2026-10-19

Versión **menor** sobre 0.10.0. Va junto con la app de escritorio 0.9.0.

### Añadido
- Gestión de Redis en la vista de consultas (antes respondía «todavía no está disponible»). La sesión de la vista abre un cliente ioredis (`openRedis` en `connection-factory.ts`) que se reutiliza en serie, hace `SELECT` solo al cambiar de base y se reconecta si se cae; la versión sale de `INFO server`. `RedisExplorerService` (`services/redis-explorer.service.ts`) y las rutas `/databases/:id/redis/*`:
  - `GET overview`: versión, modo, rol, memoria usada y `maxmemory`, clientes y claves por base (`INFO`; bases por `CONFIG GET databases`, 16 si no hay permiso).
  - `POST scan`: claves por páginas de 100 con SCAN (nunca KEYS), patrón (`MATCH`) y tipo (`TYPE`, Redis 6+), con su tipo y TTL. Da varias vueltas de SCAN hasta llenar la página.
  - `POST key`: valor según el tipo con topes: texto hasta 256 KB, hash/lista/conjunto/conjunto ordenado hasta 500 elementos (HSCAN/SSCAN si son más), stream con las 200 entradas más recientes; `truncated`, longitud y `MEMORY USAGE`. Los tipos de módulos se listan y se leen por la consola.
  - `POST edit`: crear clave (falla si existe; caducidad opcional), `set` (conserva la caducidad), hset/hdel, lset/lpush/rpush, borrar de una lista por posición (script Lua atómico), sadd/srem, zadd/zrem, xadd/xdel, caducidad (`expire`, null = PERSIST) y renombrar (RENAMENX, 409 si el nombre existe).
  - `POST delete`: UNLINK (DEL en Redis antiguos) de hasta 1000 claves, auditado.
  - `POST command`: consola tipo redis-cli. `redis-policy.ts` parte la línea (comillas, escapes `\n`, `\xHH`) y rechaza con `REDIS_COMMAND_BLOCKED` lo que rompería la conexión compartida (SUBSCRIBE, MONITOR, SELECT, MULTI/EXEC, AUTH, HELLO, QUIT, BLPOP y demás bloqueantes, XREAD con BLOCK, CLIENT REPLY). Los peligrosos (FLUSHALL, FLUSHDB, KEYS, SHUTDOWN, SWAPDB, DEBUG, SAVE, CONFIG SET/REWRITE, ACL SETUSER/DELUSER, CLIENT KILL/PAUSE, MODULE LOAD, SCRIPT/FUNCTION FLUSH, REPLICAOF, CLUSTER RESET/FAILOVER…) responden `DANGEROUS_QUERY` hasta confirmarlos y quedan en la auditoría de la conexión, como el SQL. La respuesta va tal cual con tope de 5000 elementos y 2 MB; los errores de Redis se devuelven con su texto
- Las rutas SQL (consulta, exportar, filas, árbol) responden 400 en una conexión Redis, y las de Redis en una SQL
- Tests: `redis-policy.spec.ts`, `dto/redis.dto.spec.ts` y `redis-explorer.it.spec.ts`, de integración contra un Redis real (solo con `REDIS_IT_PORT`; probado con Redis 7)

- Asistente IA que enseña (`assistant.service.ts`, prompt del sistema): con cada comando o consulta explica en pocas líneas qué hace y por qué cada opción importante, nombra el concepto de fondo cuando ayuda, indica dónde aprender más (`man`, `--help`, `\h`, `HELP`, `COMMAND DOCS`) solo la primera vez y adapta el nivel a lo que la memoria muestra que el usuario ya domina; si se pide solo el comando, lo da sin explicación. Conoce Redis (bloques ```redis para la consola; SCAN en lugar de KEYS)
- Asistente IA que valida el destino antes de proponer (`assistant-context.service.ts` → `destinations`, `target-system.ts`): cada pregunta lleva un bloque `<destino>` con el sistema real de lo que está en pantalla o se nombró. Para un servidor (por el título de la terminal o de la línea de comandos, o por su nombre, host o hostname en la pregunta): distribución y versión del agente (o la guardada), kernel, arquitectura, gestor de paquetes (apt, dnf, yum en la familia Red Hat 7 y Amazon Linux 2, zypper, apk, pacman, pkg) y arranque (systemd, OpenRC, rc), y sin datos del agente pide confirmarlo con `cat /etc/os-release`. Para una base (editor SQL, resultados, estructura o consola de Redis): motor y versión. El prompt obliga a escribir para ese sistema (paquetes, servicios, nombres como apache2/httpd; en SQL la sintaxis de ese motor y versión), a decir en una línea para cuál es, y a preguntar o dar primero el comando para averiguarlo si no hay destino claro. Tests en `target-system.spec.ts` y `assistant-context.spec.ts`
- Asistente IA con menos tokens por pregunta:
  - Datos del panel enfocados (`assistant-context.service.ts`): solo los servidores nombrados en la pregunta o abiertos en pantalla (o el único, si hay uno) llevan métricas completas; el resto va en una línea (estado, CPU, memoria, disco más lleno, carga y servicios fallidos). Sin ids ni campos vacíos, menos historial de comandos (15), notificaciones (10) y consultas auditadas (10), y tope de 30 000 caracteres en lugar de 60 000.
  - Historial literal con tope de 24 000 caracteres (`withinBudget` en `assistant-memory.service.ts`): con respuestas largas se reenvían las más recientes que caben; lo anterior sigue en el resumen.
  - Caché de prompt en Anthropic (`ai-provider.service.ts`): el prompt fijo, la memoria y el historial se marcan con `cache_control`, así las preguntas seguidas leen ese prefijo de la caché (alrededor de una décima parte del precio) y solo pagan entero lo nuevo. OpenAI y Gemini cachean solos el prefijo, que ahora es estable. `system` acepta partes (`string | string[]`)

### Corregido
- Caché en Redis (`cache/cache.module.ts`): no se estaba usando. cache-manager 7 (el de @nestjs/cache-manager 3) ya no lee la opción `store` de `cache-manager-ioredis-yet`, así que todo quedaba en la memoria del proceso sin avisar. Ahora va a Redis con `@keyv/redis` y `keyv` (sustituyen a `cache-manager-ioredis-yet`):
  - Claves con el prefijo `startcode-panel::`, así `reset()` borra solo las del panel y no el resto de un Redis compartido.
  - Las variables `REDIS_*` se convierten a número (llegaban como texto); sin `REDIS_HOST`, caché en memoria con un aviso.
  - Con Redis caído la API no falla ni se queda esperando: sin cola de comandos desconectados, una lectura cuenta como «no está» y se va al origen; reconecta sola (cada vez más espaciado, hasta 10 s) y avisa una vez por caída y al volver.
  - Al arrancar escribe y lee una clave de prueba y lo registra («Caché en Redis (host:puerto, dbN)»). Al apagar cierra la conexión.
  - Test de integración `cache.module.it.spec.ts` (con `REDIS_IT_PORT`): prefijo y TTL en Redis, `getOrSet`, que limpiar no toca claves ajenas y el comportamiento con Redis caído
- Terminal (`terminal.gateway.ts`): la salida SSH se decodifica con `StringDecoder`. Antes cada fragmento se convertía a texto por separado y un carácter de varios bytes partido entre dos (acentos, iconos Nerd Font de nvim o de un prompt) salía como `�`
- `CacheService.reset()` llamaba a `cacheManager.reset()`, que no existe en cache-manager 7, y fallaba siempre; ahora usa `clear()`
- Tests: `servers.controller.spec` (faltaba el mock de `AgentInstallService`) y `auth.service.spec` (faltaba el repositorio de sesiones) vuelven a pasar; 285 de 285

### Cambiado
- Código sin errores de ESLint ni de TypeScript (había 192 y 16). Peticiones autenticadas tipadas (`auth/types/authenticated-request.type.ts`, `AuthenticatedRequest`) en los controladores; payloads del agente y columnas jsonb de `agent-metrics.entity.ts` con sus interfaces; las columnas anulables de `server.entity.ts` declaran `| null`. Sin cambios en la API

---

## [0.10.0] — 2026-10-15

Versión **menor** sobre 0.9.1. Va junto con la app de escritorio 0.8.0.

### Añadido
- `POST /assistant/memory/summarize` (`/resume` del chat): `AssistantMemoryService.summarizeAndClear` condensa con el proveedor del usuario todos los mensajes aún sin resumir, los añade al resumen a largo plazo y borra la conversación. Espera al proveedor (no va en segundo plano); si el resumen sale vacío o falla, no se borra nada. Si ya estaba todo resumido, solo vacía el chat. Responde 409 si ya hay un resumen en curso. Límite de 6 por minuto. El resumen automático no cambia: se dispara al pasar de 40 mensajes sin resumir y deja los 20 últimos literales. Tests en `assistant-memory.spec.ts`
- Servidores favoritos: columna `dat_favorited` (`favoritedAt`, `timestamptz`) en `tbl_servers`, devuelta en la respuesta, y `PUT /servers/:id/favorite` con `{ favorite: boolean }`. Hasta 3 por usuario (`MAX_FAVORITES`): el cuarto responde 409. Marcar uno que ya lo es, o quitar uno que no lo es, no cambia nada. Migración `src/migrations/add_favorite_to_servers.sql` (aplicarla antes de desplegar en una base existente) y columna añadida a `01-schema.sql`. Tests en `servers.service.spec.ts`

### Seguridad
- Llaves privadas SSH cifradas en la base: antes `str_privatekey` se guardaba en texto plano. Ahora `ServersService` las cifra con `CredentialsCipherService` (AES-256-GCM, `DB_CREDENTIALS_KEY`, formato `v1:<iv>:<tag>:<cifrado>`, lo mismo que las contraseñas de las bases y las claves del asistente) al crear un servidor y al cambiar su llave (`updatePrivateKey` escribe solo la columna, sin volver a guardar la entidad), y `findOneWithPrivateKey` las descifra solo en memoria para conectar. La terminal deja de leer la llave por su cuenta y usa `findOneWithPrivateKey`, así que toda conexión SSH (terminal, SFTP, comandos, Docker, Kubernetes, servicios, agente) pasa por el mismo descifrado. Al arrancar, el backend cifra las llaves que seguían en claro; sin `DB_CREDENTIALS_KEY` las deja como estaban, avisa en el registro y siguen funcionando. `ServersModule` importa `DatabasesModule` por el cifrador. `DB_CREDENTIALS_KEY` pasa a ser obligatoria para crear servidores: documentado en `DEPLOY.md` y en los `.env` de ejemplo. Tests en `servers.service.spec.ts`; se corrige de paso el test de `create`, que esperaba `OFFLINE` en lugar de `PENDING`

### Corregido
- Terminal: cerrar la pestaña (o la terminal) mientras aún conectaba dejaba abierta la conexión SSH en el servidor. `handleDisconnect` corría antes de que existiera la sesión y no había nada que limpiar; ahora `handleConnection` comprueba `client.disconnected` tras abrir el cliente SSH y tras abrir la shell, y la cierra si el socket ya se fue

---

## [0.9.1] — 2026-10-14

Versión de **parche** sobre 0.9.0: despliegue con la imagen de Docker Hub (primera versión publicada allí). Sin cambios en la API.

### Cambiado
- `docker-compose.yml` ya no compila: descarga `<DOCKERHUB_USER>/startcode-panel-backend:<BACKEND_TAG>` y corre en producción (`NODE_ENV=production`, puerto 3001, `init: true`). Por defecto usa una base PostgreSQL y un Redis existentes (`DB_HOST`/`DB_PORT` y `REDIS_HOST`/`REDIS_PORT` en `.env.production`). Con esas variables vacías y los perfiles `db` y `cache`, el compose levanta los suyos, como antes. `depends_on` con `required: false`, para que solo espere a los servicios de los perfiles activos
- `Dockerfile`: etiquetas OCI (título, descripción, versión con `--build-arg VERSION`)
- `Makefile`: `make image` (imagen local) y `make push` (Docker Hub, amd64 y arm64, con las etiquetas `X.Y.Z`, `X.Y` y `latest`). `make push` se niega a volver a subir una `X.Y.Z` ya publicada. Se arregla `make help`, que no tenía su objetivo. Guía de compilación, publicación y versionado en `docs/IMAGENES_DOCKER.md`
- `.env.production.example`: `DOCKERHUB_USER`, `BACKEND_TAG`, `DB_HOST`, `DB_PORT`, `DB_VOLUME`, `REDIS_HOST` y `REDIS_PORT`
- Los datos de Postgres (perfil `db`) van en un volumen externo de Docker (`DB_VOLUME`, `external: true`): el compose no lo crea ni lo borra. `DEPLOY.md` explica cómo enlazarlo a una carpeta de `/srv`
- `DEPLOY.md`: publicar en Docker Hub, instalar con base existente o con la del compose, actualizar, migraciones y copias en los dos casos, y el aviso de compartir la base con un backend en desarrollo (que sincroniza el esquema). Probado: imagen compilada y compose con los perfiles `db` y `cache` en producción (health `ok`, base conectada, administrador creado)

---

## [Cloud 0.2.1] — 2026-10-14

Versión de **parche** sobre 0.2.0: despliegue con la imagen de Docker Hub (primera versión publicada allí). Sin cambios en la API.

### Cambiado
- `docker-compose.yml` ya no compila: descarga `<DOCKERHUB_USER>/startcode-cloud:<CLOUD_TAG>` y corre en producción (puerto 3100, `init: true` para que los ffmpeg huérfanos no queden zombis, registros con rotación)
- `Dockerfile`: etiquetas OCI (título, descripción, versión con `--build-arg VERSION`)
- `Makefile` nuevo: `install`, `dev`, `build`, `test`, `lint`, `prod`, `user U=…`, y `image`/`push` para Docker Hub (amd64 y arm64; etiquetas `X.Y.Z`, `X.Y` y `latest`; no vuelve a subir una versión ya publicada)
- `.env.production.example` nuevo, con `DOCKERHUB_USER`, `CLOUD_TAG`, `CLOUD_PORT`, `CLOUD_DATA_VOLUME` y `CLOUD_STORAGE_VOLUME`
- `/data` y `/storage` se montan desde volúmenes externos de Docker (`external: true`): el compose no los crea ni los borra, y se reutilizan los de despliegues anteriores por su nombre
- README: despliegue con la imagen de Docker Hub. Guía común con el backend en `docs/IMAGENES_DOCKER.md`. Probado: imagen compilada y compose en producción (health con la versión, inicio de sesión del administrador, ffmpeg en la imagen)

---

## [App de escritorio 0.7.1] — 2026-10-14

Versión de **parche** sobre 0.7.0.

### Añadido
- Resultados de consultas: al pasar el mouse por una celda cortada («…»), un globo (`CellTip` en `ResultGrid.tsx`) muestra el valor completo con saltos de línea, tras 350 ms. Es uno para toda la tabla, con manejadores delegados en el contenedor y nada por celda. Solo sale si el texto no cabe (`scrollWidth`), se queda mientras el mouse está en la celda o en el globo (se puede desplazar y copiar) y se cierra al desplazar la tabla. Va debajo de la celda, o encima si no cabe. No sale en columnas sensibles ocultas. Sustituye al `title` nativo de más de 60 caracteres

### Cambiado
- Editor SQL: Ejecutar y Ctrl + Enter corren la sentencia donde está el cursor, no todo el editor, así que se pueden tener varias separadas por `;` (`statementAt` en `utils/sql.ts`). Corta con los tokens del resaltado: los `;` dentro de cadenas, comentarios, identificadores o bloques `$$` de PostgreSQL no cuentan. Con el cursor justo tras un `;` en la misma línea, la que acaba ahí; en una línea en blanco o un comentario, la anterior (o la siguiente). Con texto seleccionado se sigue ejecutando la selección

### Corregido
- Resultados de consultas (`ResultGrid.tsx`): las barras de desplazamiento propias tapaban la última fila y la última columna; el contenedor reserva sus 12 px abajo y a la derecha (`pb-3 pr-3`)
- Terminal del servidor (`ServerTerminal.tsx`): al cerrarla queda oculta con `display: none`; el `ResizeObserver` disparaba `fit()` con el contenedor a 0, que la dejaba en 2 columnas y mandaba ese tamaño a la shell remota, que redibujaba el prompt a ese ancho. Al reabrirla, el cursor quedaba corrido sobre el prompt (lo escrito no se veía hasta pasarlo) hasta un `clear`. Ahora, oculta no se ajusta, y el tamaño solo se envía al servidor si cambió
- Barra de título: el nombre de la app pasa de `text-white/50` a `text-white/75`; en algunos temas apenas se leía
- Barras de desplazamiento propias por encima de todo: iban en una capa fija con `z-index: 100` y tapaban el menú de sugerencias del editor SQL (z-70) y lo que flotara sobre su zona. Ahora cada barra toma el z-index de su zona más uno, con un mínimo de 40 (`levelOf` en `utils/overlayScrollbars.ts`); `.osb-layer` pasa a `display: contents`
- Editor SQL: al pasar a mayúsculas una palabra reservada (`as` → `AS`), al sangrar o al aceptar una sugerencia, la vista saltaba al final de la consulta. Al reemplazar el valor, el navegador lleva el cursor al final; ahora `placeCaret` devuelve el cursor y también el desplazamiento, moviéndolo solo lo justo para que la línea del cursor se vea

---

## [App de escritorio 0.7.0] — 2026-10-13

Versión **menor** sobre 0.6.0: Kubernetes en el detalle del servidor. Va junto con el backend 0.9.0.

### Cambiado
- Al cerrar el modal de instalar servicios, si se instaló o desinstaló algo, se recarga el detalle del servidor: aparecen o se quitan al momento pestañas como Docker o Kubernetes. Antes se invalidaba `['server', id]`, pero el detalle usa `['serverDetail', id]`, y además el inventario no cambiaba hasta el siguiente envío del agente (hasta cinco minutos)
- **Eventos en vivo del panel** (progreso de instalación de servicios paso a paso, avisos, métricas): el socket se creaba con el token de acceso de ese momento (`auth` fijo). Tras reconectarse, por ejemplo al reiniciarse el backend (con `--watch`, en cada cambio) o tras un corte, volvía con ese token; si ya había caducado (30 min), el gateway lo rechazaba y cerraba la conexión, y socket.io no reintenta tras un cierre del servidor. Así la instalación solo mostraba «Conexión SSH» y después todos los pasos de golpe con la respuesta final. Ahora `auth` es una función que da el token vigente en cada intento, los reintentos no tienen límite (hasta 10 s entre ellos) y, si el servidor cierra la conexión, una petición autenticada renueva el token y el socket se vuelve a conectar (`RealtimeMetricsContext`)
- Abrir enlaces en el navegador («Vincular a tu red» de Tailscale, enlaces de los Markdown de Cloud): las capacidades tenían `opener:allow-open-url`, que permite el comando pero sin ninguna URL en su alcance, así que Tauri rechazaba todas. Se añade `opener:allow-default-urls` (http, https, mailto y tel). Si el navegador no se puede abrir, el botón de Tailscale lo avisa con el enlace
- **Descargas de Cloud**: el diálogo «Guardar como» se abre al instante (`pickSavePath` en `lib/download.ts`), antes de descargar nada; antes se bajaba el archivo o la carpeta comprimida entero a memoria y solo después aparecía el diálogo, que con archivos grandes tardaba mucho o no llegaba a abrirse. Luego la descarga la hace Rust en segundo plano (`cloud_download` en `src-tauri/src/cloud_download.rs`, con reqwest y tokio, que ya venían con tauri y el updater): lee la respuesta por partes, escribe con un búfer de 1 MB y solo manda el progreso al webview por un `Channel` cada 150 ms, así que la app sigue respondiendo con archivos grandes (una primera versión en el webview, con `fetch` y el plugin `fs`, congelaba la ventana). Cancelar (`cloud_download_cancel`) corta la tarea al instante con un `Notify`, aunque el servidor no esté enviando nada. Nuevo aviso de descarga en los avisos de Cloud con barra de progreso, bytes, porcentaje y carpeta de destino; en una carpeta, que la nube comprime mientras envía, la barra late y muestra lo descargado. Se puede cancelar (borra lo escrito); al terminar, «Mostrar en la carpeta». Si falla o se corta, se borra el archivo a medias. Permiso nuevo: `opener:allow-reveal-item-in-dir`. Se quita `cloudApi.zip`, que ya no se usa
- **Notificaciones del sistema en macOS**: en la app empaquetada, `macos_notify` (UNUserNotificationCenter) pide el permiso con el diálogo del sistema y entrega la notificación. Si no se puede usar, responde `UNAVAILABLE:` y el frontend usa `tauri-plugin-notification`, la vía oficial de Tauri: pasa en desarrollo (`tauri dev` no corre desde una .app: se comprueba con `bundlePath` terminado en `.app`, porque el Info.plist que Tauri incrusta da un `bundleIdentifier` igualmente y `currentNotificationCenter` abortaba la app con una NSException) y si el sistema no deja a la app pedir permiso. En desarrollo el plugin publica como `com.apple.Terminal`: las notificaciones llegan si Terminal las tiene permitidas en Ajustes del Sistema → Notificaciones, y Configuración → Notificaciones lo indica en macOS en desarrollo. Un «No permitir» del usuario se respeta. Se descarta el respaldo con `osascript` de una versión anterior: macOS atribuye esas notificaciones al Editor de Scripts y, sin permiso para él, las descarta sin error. Windows y Linux no cambian. Pendiente de compilar y probar en un Mac
- Configuración → Sesiones activas explica el nuevo límite: hasta 3 sesiones abiertas por cuenta
- **Barras de desplazamiento propias** en toda la app (`utils/overlayScrollbars.ts`, instaladas en `main.tsx`): WebKit no deja cambiar el cursor de las nativas, y en el editor SQL aparecía la I de escritura sobre la barra. Ahora se ve la manito para agarrar (`grab`, y `grabbing` al arrastrar), un clic en la pista avanza una página y el thumb es más visible: tinta al 30 % y, al pasar el mouse, 10 px con el gradiente de marca. Aparecen en la zona bajo el mouse o que se desplaza y se desvanecen al salir. Un solo gestor sin React, con escuchas delegadas y `transform` en `requestAnimationFrame`. El editor SQL ya no compensa los 6 px de la barra nativa en el resaltado ni en los números de línea
- Las notificaciones emergentes salen abajo al centro de la app (`Toaster` en `AppProviders.tsx`). Sus colores salen del tema activo (`.toaster-themed` en `App.css`, variables de sonner): fondo de la superficie teñido con la marca o con el color del tipo (éxito, aviso, error, info), borde del mismo tono y texto mezclado con la tinta, legible también en Solar; antes eran casi negras en todos los temas. Guardar una fila editada o crear una fila desde los resultados ahora avisa con una notificación; antes era un texto pequeño en la barra del resultado que pasaba desapercibido
- Docker: los contenedores se leen cada vez que se entra al tab y, mientras está abierto, solo con «Actualizar»; ya no se refrescan cada 15 s (`useDockerContainers`), igual que Kubernetes

### Añadido
- **Barra de título propia** (`components/layout/TitleBar.tsx`) acorde al tema: transparente sobre el fondo, con el nombre de la app, zona de arrastre y doble clic para maximizar; se oculta en pantalla completa. macOS conserva los semáforos nativos con `titleBarStyle: "Overlay"` (`tauri.macos.conf.json`, que Tauri combina con `tauri.conf.json` al compilar en macOS). En Windows y Linux la ventana va sin decoraciones del sistema (`decorations: false`) con botones como los de cada sistema: rectangulares con cerrar en rojo en Windows y redondos en Linux (GNOME); la sombra y el redimensionado por los bordes los mantiene Tauri. En Windows 11 se pierde el menú de diseños de ajuste al pasar por maximizar (siguen Win+flechas y arrastrar a los bordes). Permisos nuevos: `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-internal-toggle-maximize`, `allow-close` y `allow-start-dragging`. El panel del asistente baja para no quedar bajo la barra
- **Aviso de cada inicio de sesión** como notificación del sistema en los demás equipos del usuario: «Nuevo inicio de sesión», con el nombre del equipo, la app y su sistema y la IP. La app manda el nombre del equipo (comando `device_name` de Tauri en `src-tauri/src/device.rs`, solo biblioteca estándar: `scutil --get ComputerName` en macOS, `COMPUTERNAME` en Windows, `/etc/hostname` en Linux) en la cabecera `X-StartCode-Device`, codificada y solo en las peticiones de inicio de sesión
- **Eliminar filas** desde los resultados: al seleccionar filas por su índice (clic, Mayús o Ctrl) aparece «Eliminar N filas» junto a «Copiar» si alguna tabla del resultado tiene su clave primaria en el SELECT. La confirmación (`DeleteRowsModal.tsx`) dice la tabla (en un JOIN se elige), cuántas filas y la clave de cada una, que no se puede deshacer, y avisa si hay cambios sin guardar. Al terminar se repite la consulta
- **Sangría automática** en el editor SQL (`newlineIndent` en `utils/sql.ts`): al pulsar Enter dentro de una consulta (las consultas se separan por `;`), la línea nueva va un nivel más adentro que la primera línea de la consulta, o conserva la sangría actual si ya es mayor; tras un `(` abierto, un nivel más. Después de `;` vuelve al margen. El salto de línea sigue pasando a mayúsculas la palabra reservada anterior
- **Predicción de tablas y columnas** en el editor SQL (`utils/sqlComplete.ts`, `SqlEditor.tsx`): al escribir aparece un menú junto al cursor con tablas y vistas después de FROM, JOIN, INTO o UPDATE; columnas de las tablas que usa la sentencia (también tras `alias.` o `tabla.`), sus alias, y en PostgreSQL las tablas de un esquema tras `esquema.` (fuera de `public` se insertan con el esquema delante). Flechas para elegir, Enter o Tab acepta, Escape cierra y Ctrl + Espacio lo abre sin haber escrito nada; no sugiere dentro de cadenas, comentarios ni números. Los nombres que lo necesitan se insertan citados según el motor. Rendimiento: usa la misma caché de React Query que el árbol (sin peticiones nuevas si ya se abrió, una por base si no), el índice se arma una vez por base y en cada tecla solo se analiza la sentencia del cursor; como máximo 50 sugerencias, en un menú flotante fuera del panel
- **Consolas SQL** en el detalle de la base (`DatabaseDetail.tsx`): lista de pestañas a la derecha del editor, «Consola 1» a «Consola 6» (máximo 6), «Agregar consola» abajo y una × para cerrar cada una (la última no se cierra; al cerrar, su número se reutiliza). Doble clic en una pestaña la renombra (Enter guarda, Escape cancela, vacío vuelve a «Consola n»). Cada consola conserva su SQL, deshacer, scroll y su último resultado con la tabla tal como quedó (ediciones, filas nuevas): todas quedan montadas y solo se oculta la inactiva. Pueden ejecutar a la vez; la pestaña muestra un indicador mientras su consulta corre. El asistente lee y escribe en la consola activa y el doble clic en el árbol deja la sentencia en ella
- **Nueva fila en línea** en los resultados de una consulta (`ResultGrid.tsx`), sin formulario: solo si la consulta es de una sola tabla (sin JOIN) y trae todas sus columnas (`SELECT *`); si no, el botón queda deshabilitado y dice por qué (JOIN, columnas que faltan). Cada clic agrega una fila borrador arriba del resultado, resaltada; sus celdas empiezan en «Por defecto (valor)» si la columna tiene valor por defecto o lo calcula la base (autoincremento, now()…), en NULL si lo admite y vacías si son obligatorias; doble clic edita la celda con las opciones NULL y DEFECTO; las generadas no se escriben. Guardar y descartar en la columna del índice, como al editar; al guardar, la fila tal como quedó en la tabla (con su id y valores por defecto) pasa a ser la primera del resultado; si la tabla no tiene clave para leerla de vuelta, se repite la consulta. Se quita `NewRowModal.tsx`
- Pestaña **Kubernetes** (`components/servers/KubernetesTab.tsx`, carga diferida) en el detalle del servidor cuando el inventario de servicios trae una unidad de k3s, k3s-agent, microk8s (kubelite/kubelet), rke2, k0s o kubelet (`KUBERNETES_UNITS` en `ServerDetail.tsx`, mismo criterio que Docker). Si la unidad no está activa, lo dice y remite a Servicios
- Pods de todos los namespaces en filas: nombre, namespace y dueño (Deployment, StatefulSet, DaemonSet, Job…), estado como en `kubectl` con tono semántico (en marcha, atención, error, terminado), contenedores listos, reinicios (en ámbar si hay), CPU y memoria si hay metrics-server, y edad. Al desplegar una fila: nodo, IP, fase, creación y cada contenedor con su imagen, estado o motivo y reinicios
- Resumen (en ejecución, con problemas, completados), vistas Activos / Con problemas / Todos, filtro por namespace (`Select`) y por texto (nombre, dueño o imagen); los pods con problemas van primero
- Misma escalera de sudo que Docker (formulario de contraseña que no se guarda), lectura al abrir el tab y después solo con «Actualizar», sin refresco automático (`useKubernetesPods`, `services/kubernetes.service.ts`)
- Instalar servicios desde el detalle del servidor (`components/servers/InstallServiceModal.tsx`): el modal conserva su tamaño (alto fijo; el catálogo desplaza dentro para poder añadir más) y cada servicio es una tarjeta con su logo real (`serviceLogos.ts`, trazos de Simple Icons CC0 con el color oficial). Por ahora se puede instalar **Nginx**; el resto se ve marcado «Próximamente». Al elegirlo se confirma qué se hará, luego se ven los pasos en vivo (`service:install:progress`, `useServiceInstall`) y el resultado con la versión y el sistema, o el motivo del fallo con las últimas líneas de la salida. Si sudo pide contraseña, se pide en el mismo modal y se reutiliza al reintentar, sin guardarse
- Instalar y desinstalar con el mismo botón: al elegir un servicio se comprueba sin privilegios si ya está (`install-status`). Si no está, se confirma la instalación; si ya está, se avisa con su versión y se pide confirmar una **desinstalación completa**, con la lista de lo que se borrará (botón en rojo). El catálogo lo explica en una nota. Los pasos, la contraseña de sudo y el resultado funcionan igual en los dos sentidos
- **Node.js** se puede instalar y desinstalar desde el catálogo y sube una posición (queda tras MongoDB, antes de los servicios «Próximamente»). Como no es un servicio, el paso de arranque sale como «no se ejecuta como servicio»
- **Tailscale y WireGuard** se pueden instalar y desinstalar desde el catálogo (ya no son «Próximamente»). Al terminar de instalar, el resultado trae los datos de conexión: con Tailscale, el botón «Vincular a tu red», que abre el enlace de inicio de sesión (o la IP de Tailscale si ya estaba vinculado); con WireGuard, la dirección y el puerto de wg0 y su clave pública con «Copiar». Si la sesión SSH del panel entra por esa VPN, la desinstalación se detiene con el motivo antes de tocar nada
- **Fail2ban y restic** se pueden instalar y desinstalar desde el catálogo. Con todos ellos, «Próximamente» queda solo para Proxmox VE. Fail2ban muestra al terminar la protección activa y que la IP del panel nunca se bloquea; restic, cómo crear el primer repositorio de copias
- **Proxmox VE** sustituye a WordPress en el catálogo, y se añaden **Fail2ban**, **Tailscale**, **WireGuard** y **restic**, todos por ahora como «Próximamente» con su logo real. Fail2ban y restic no tienen logo vectorial: se usa el PNG oficial del proyecto (`assets/service-logos/`), y `ServiceLogo` admite imagen además de trazo
- Bases de datos en el catálogo: **PostgreSQL**, **Redis**, **MongoDB** y **MySQL** (tarjeta con dos opciones: MySQL de Oracle, solo en Ubuntu y RHEL/Fedora, y **MariaDB**, compatible, en todas). Si el sistema no admite el servicio (p. ej. MongoDB sin AVX o en una versión sin paquetes oficiales), se explica antes de instalar y el botón queda desactivado. La desinstalación avisa de que borra todas las bases de datos. Los logos de marca casi negros (MariaDB) toman la tinta del tema para verse en los tres
- **Docker** se puede instalar y desinstalar desde el catálogo y pasa a la tercera posición (después de Nginx y Kubernetes)
- **Kubernetes** sustituye a Apache en el catálogo: al elegirlo se comprueba si ya hay alguna distribución instalada. Si no, se elige entre **K3s**, **MicroK8s**, **k0s** y **RKE2** (con su logo real: K3s, Canonical, Kubernetes y Rancher), y las que este sistema no admite salen desactivadas con el motivo. Si ya hay una, se ofrece desinstalarla por completo con la lista de lo que se borra

---

## [0.9.0] — 2026-10-13

Versión **menor** sobre 0.8.0. Va junto con la app de escritorio 0.7.0.

### Cambiado
- Instalar o desinstalar un servicio deja al día su inventario sin esperar al agente: `Recipe.units` (unidades de systemd de cada receta), `systemctl show` sin privilegios al terminar y `AgentDataService.syncServiceUnits`, que añade o actualiza las unidades cargadas y quita las que ya no existen; luego emite `server:services:updated`. Solo con systemd; si falla, no afecta a la operación
- Inicio de sesión: hasta 3 sesiones activas por usuario en vez de una sola. Al entrar desde un cuarto dispositivo se revoca la que lleva más tiempo sin usarse (y las caducadas que sigan sin revocar), en `AuthService.makeRoomForSession`; antes cualquier inicio de sesión cerraba todas las demás. Cambiar la contraseña y las demás acciones que cierran las otras sesiones no cambian

### Añadido
- Aviso de seguridad por cada inicio de sesión (login, 2FA y cambio de contraseña caducada; no el registro): notificación `security` «Nuevo inicio de sesión» con el dispositivo (nombre del equipo de `X-StartCode-Device`, app y versión, o navegador, y sistema según el user-agent: `describeDevice`) y la IP, con `ip`, `device` y `sessionId` en `metadata`. `AuthService.onLogin` avisa a quien se suscriba y `NotificationsService` se suscribe en `onModuleInit` (importa el módulo de auth: sin dependencia circular). Un fallo al guardar el aviso no impide entrar. La cabecera se decodifica, se limpia de caracteres de control y se corta a 64
- `POST /databases/:id/rows/delete`: borra hasta 1000 filas, cada una por su clave primaria completa (validada contra la tabla con `assertPrimaryKeys`; sin clave primaria no se borra nada) con valores parametrizados, en una transacción: si una falla (p. ej. por una clave foránea) se revierten todas. Queda en la auditoría de la conexión con el estado y las filas afectadas. `DeleteRowsDto.keys` lleva `@Type(() => Object)`: sin él, la conversión implícita del `ValidationPipe` convertía cada clave en `[]` y la petición fallaba con «each value in keys must be an object». Probado contra MariaDB 11 y PostgreSQL 16 con claves simples y compuestas, clave incompleta, tabla sin clave primaria y un borrado revertido por clave foránea
- `POST /databases/:id/tables/columns` y `POST /databases/:id/rows/insert`: columnas de una tabla para una fila nueva (tipo, NULL, valor por defecto literal ya sin comillas, si lo calcula la base o es generada, PK) e INSERT solo con las columnas recibidas, validadas contra la tabla y con valores parametrizados (`INSERT … () VALUES ()` o `DEFAULT VALUES` si no viene ninguna). Devuelve la fila insertada (`row`): PostgreSQL con `RETURNING *`; MySQL/MariaDB la relee por su PK (la enviada o el `insertId` del autoincremento), o `null` si la tabla no tiene PK. MySQL, MariaDB (que da los literales y NULL como SQL) y PostgreSQL (`column_default` como expresión, identidad, `GENERATED ALWAYS`). `unquoteDefault` en `explorer.common.ts`, con tests. Probado contra MySQL 8.4, MariaDB 11 y PostgreSQL 16 reales
- `POST /agent-data/servers/:id/kubernetes/pods` (`KubernetesService`, `monitoring/services/kubernetes.service.ts`): solo lectura por SSH. Detecta el CLI sin privilegios (`pickCli`): `kubectl` si el usuario tiene kubeconfig propio; si no, `k3s kubectl`, `microk8s kubectl` o el kubectl de rke2 con su kubeconfig, y por último `kubectl` a secas. Lee `get pods -A -o json` (tope de 40 MB) y, si responde metrics-server, `top pods -A`. Si el kubeconfig solo lo lee root, usa la escalera de sudo de `ServiceControlService` (403 `SUDO_REQUIRED`)
- `parsePods` calcula el STATUS como `kubectl` (motivo del contenedor que espera o falla, `Init:…`, `Terminating`), listos, reinicios y el dueño (el ReplicaSet se muestra como su Deployment); `parseTop` pasa CPU a milicores y memoria a bytes. Errores: 503 `KUBERNETES_UNAVAILABLE` (sin CLI o clúster que no responde) y `KUBERNETES_TOO_LARGE`. Tests en `kubernetes.service.spec.ts`
- `POST /agent-data/servers/:id/services/install` (`ServiceInstallService`): instala por SSH un servicio del catálogo con pasos (SSH, sistema, privilegios, instalación existente, paquetes, arranque, comprobación) emitidos al dueño por el socket (`service:install:progress`) y devueltos en la respuesta. Una instalación a la vez por servidor; 10 min por comando
- Recetas puras en `install-recipes.ts`: el sistema se reconoce por `/etc/os-release`, el gestor de paquetes que exista (`apt-get`, `dnf`, `yum` con EPEL de respaldo, `zypper`, `apk`, `pacman`) y el arranque (systemd u OpenRC), no por el nombre de la distribución. Nginx: si ya está, solo se asegura que esté en marcha; instala sin preguntar (`DEBIAN_FRONTEND=noninteractive`), `systemctl enable --now` (o `rc-update` + `rc-service`), y si no arranca se adjuntan las últimas líneas del registro. Probado instalando en contenedores Ubuntu 24.04, Rocky Linux 9 y Alpine 3.20. Tests en `install-recipes.spec.ts`
- Desinstalación completa (`POST …/services/uninstall`, `UninstallPlan`) y comprobación previa (`POST …/services/install-status`, sin sudo: sistema, si está instalado y su versión). Desinstalar nginx: detiene y deshabilita la unidad (systemd u OpenRC), purga los paquetes `nginx*` y `libnginx-mod-*` (apt) o `nginx`/`nginx-*` (rpm, apk, pacman) con las dependencias que quedan sin uso, borra `/etc/nginx`, registros, caché, `/var/lib`, `/usr/share/nginx`, unidades, logrotate, la página de bienvenida de Debian y el usuario y grupo `nginx` (`userdel` o `deluser` en BusyBox; Debian usa `www-data`, que no se toca, igual que los sitios de `/var/www`). Al final busca restos y, si queda algo, falla con `RESIDUE_LEFT` y la lista. Probado instalando y desinstalando en Ubuntu 24.04, Rocky Linux 9 y Alpine 3.20 sin restos
- Recetas de Kubernetes de un nodo (plano de control y trabajador) con el instalador oficial de cada una: K3s (`get.k3s.io`), MicroK8s (`snap install microk8s --classic`; instala snapd si falta, de EPEL en RHEL y familia), k0s (`get.k0s.sh` + `k0s install controller --single`) y RKE2 (`get.rke2.io` + `rke2-server`). Instalan curl si falta y esperan a que el nodo esté `Ready` (hasta 12 min). RKE2 y MicroK8s piden systemd (`supports`), y MicroK8s también snapd en zypper/pacman. No se instala una si ya hay otra (`OTHER_INSTALLED`)
- Desinstalar Kubernetes: script oficial (`k3s-uninstall.sh`, `snap remove --purge`, `k0s reset`, `rke2-uninstall.sh`), luego borra datos, configuración e imágenes (`/etc/rancher/*`, `/var/lib/rancher/*`, `/var/lib/k0s`, `/var/snap/microk8s`, `/var/lib/kubelet`, unidades y registros), reglas de iptables de Kubernetes (`KUBE-`, `CNI-`, flannel, Calico), interfaces de red (cni0, flannel.1, kube-bridge, kube-ipvs0, vxlan.calico, cali*) y la configuración CNI de Kubernetes. Sin tocar lo compartido: interfaces `veth` (Docker, Podman), redes CNI de Podman, `/opt/cni` si es de un paquete y snapd. Comprueba restos y falla con la lista si queda algo
- Receta de Node.js: LTS desde el repositorio oficial de NodeSource (`setup_lts.x`) en apt, dnf y yum, con respaldo a `nodejs`/`npm` de la distribución; en openSUSE (`nodejs-default`, o `nodejs22`/`nodejs20`), Alpine y Arch, el paquete de la distribución. `InstallPlan.noService` marca que no hay nada que arrancar. Desinstalar purga `nodejs`, `npm` y `libnode` (los cientos de `node-*` del npm de Debian se van con autoremove), quita el repositorio y la clave de NodeSource, los módulos globales de npm y sus enlaces en `/usr/bin` y `/usr/local/bin`, cabeceras, `npmrc`, cachés e historiales de npm, node-gyp y la consola de node. No toca los `node_modules` de los proyectos. Probado en Ubuntu 24.04 y Rocky Linux 9 (Node 24 LTS) y en Alpine 3.20 (Node 20), con un paquete global instalado antes de desinstalar, sin restos
- Recetas de **Tailscale** y **WireGuard**. Tailscale: instalador oficial (`tailscale.com/install.sh`, que añade su repositorio) en apt, dnf, yum y zypper con respaldo al paquete de la distribución; Alpine y Arch, su paquete; unidad `tailscaled` (OpenRC: `tailscale`). Desinstalar hace `tailscale logout` (el nodo sale de la tailnet), `tailscaled --cleanup`, purga `tailscale*` y borra estado, caché, repositorio, clave gpg de rpm, `tailscale0` y sus cadenas `ts-*` de iptables. WireGuard: `wireguard-tools` (en apt sin recomendados, sin DKMS), interfaz `wg0` con claves propias (`umask 077`) en la primera subred 10.x.0.0/24 libre y el primer puerto UDP libre desde 51820, abierto en ufw o firewalld si están activos; antes de levantarla comprueba que el kernel tenga WireGuard. systemd: `wg-quick@wg0`; OpenRC: servicio propio `/etc/init.d/wg-quick-wg0`. Un `wg0.conf` existente se respeta. Desinstalar cierra el puerto, baja todas las interfaces WireGuard (detectadas por `DEVTYPE=wireguard` en sysfs, porque el `ip` de BusyBox no filtra por tipo), purga y borra `/etc/wireguard`. Nuevo en `InstallPlan`: `access` (paso «Datos de conexión», líneas `URL:`, `INFO:` y `KEY:` que vuelven en `result.access`); en `UninstallPlan`: `guard`, que corre sin sudo (sudo limpia `SSH_CONNECTION`) y bloquea con `UNSAFE_UNINSTALL` si la IP local de la sesión SSH está en `tailscale0` o en una interfaz WireGuard. Probado instalar + desinstalar + restos en Ubuntu 24.04, Rocky Linux 9 y Alpine 3.20; el enlace de Tailscale con tailscaled en modo userspace; WireGuard con wg0 levantada; el bloqueo con interfaces simuladas (iproute2 y BusyBox); los 281 comandos generados pasan `sh -n` en dash y BusyBox. Tests en `install-recipes.spec.ts`
- Recetas de **fail2ban** y **restic**. fail2ban: paquete del sistema (RHEL y familia: `fail2ban-server` y `fail2ban-systemd` desde EPEL, sin `fail2ban-firewalld`) y una jail de sshd propia en `/etc/fail2ban/jail.d/startcode.local`: puerto real de sshd (`sshd -T`), 1 h de bloqueo con 5 fallos en 10 min, `backend = systemd` o el registro de sshd del sistema (auth.log, secure o messages), acción de firewalld, nftables o iptables según lo que haya, validada con `fail2ban-client -t`; «en marcha» exige la jail cargada. La IP del panel va en `ignoreip`: nuevo marcador `SSH_CLIENT_IP` en los comandos de instalación, que el servicio sustituye por la IP de `SSH_CONNECTION` leída sin sudo y validada. Desinstalar lo detiene (quita sus bloqueos), purga y borra configuración, base de bloqueos, registros y reglas `f2b` de iptables, nftables e ipset. restic: binario oficial de la última versión (la redirección de `/releases/latest`, sin la API de GitHub) comprobado con `SHA256SUMS` en `/usr/local/bin`, con respaldo al paquete de la distribución (EPEL en RHEL); según la arquitectura (amd64, arm64, arm, 386, ppc64le, s390x, riscv64). No es un servicio. Desinstalar borra binario, paquete, cachés y autocompletado, y nunca los repositorios de copias. Probado: fail2ban instalado con la jail activa y la IP del panel en la lista blanca en Ubuntu 24.04, Rocky Linux 9 y Alpine 3.20; restic 0.19.1 oficial con la suma verificada en las mismas tres; los 513 comandos de las cuatro recetas nuevas pasan `sh -n` en dash y BusyBox; tests en `install-recipes.spec.ts`. La desinstalación de fail2ban y restic en contenedores queda pendiente de probar
- Recetas de bases de datos (todas quedan escuchando solo en el propio servidor, como las deja el paquete):
  - PostgreSQL del sistema en los seis gestores; crea el clúster donde el paquete no lo hace (`postgresql-setup --initdb` en RHEL con respaldo a `initdb`, `initdb` en Arch, `rc-service postgresql setup` en Alpine)
  - MySQL (`mysql-server` en Ubuntu; `mysql-server`, `community-mysql-server` o `mysql8.4-server` con dnf) y MariaDB (`mariadb-server`, `mariadb-install-db` en Alpine y Arch), en el grupo `mysql`: solo una a la vez; se distinguen por `mysqld --version`
  - MongoDB 8.0 desde su repositorio oficial con clave (Ubuntu 20.04/22.04/24.04, Debian 12, RHEL/Rocky/Alma 8–9); `supports` comprueba la versión del sistema (`VERSION_CODENAME`, `VERSION_ID`) y que la CPU tenga AVX (sin él, mongod 5.0+ muere con «Illegal instruction»)
  - Redis del sistema (EPEL de respaldo, instancia `redis@default` en openSUSE, Valkey de respaldo en Arch)
- Desinstalar bases de datos: purga sus paquetes sin quitar las bibliotecas cliente que usan otros (`-libs`, connector, libpq: se van con autoremove si nadie las usa), y borra datos, configuración, registros, historiales de los clientes (psql, mysql, mongosh, redis-cli), repositorio y clave (MongoDB) y usuarios/grupos propios. `removeByPattern` filtra con `grep -e` (un patrón como `-libs$` era una opción de grep y la lista salía vacía) y en Alpine incluye los nombres virtuales de `/etc/apk/world`
- La detección del sistema añade `VERSION_ID`, `VERSION_CODENAME`, arquitectura y AVX; `install-status` de un servicio suelto devuelve `unsupported` con el motivo. El motivo concreto (`supports`) se evalúa antes que el genérico de gestor no reconocido
- Probado instalando y desinstalando sin restos en contenedores: Ubuntu 24.04 (PostgreSQL, MySQL, MariaDB, MongoDB, Redis), Rocky Linux 9 (las cinco) y Alpine 3.20 (PostgreSQL, MariaDB, Redis). MongoDB se instaló y desinstaló, pero no pudo arrancar en la máquina de pruebas por falta de AVX. Los 271 comandos generados pasan `sh -n` en dash y BusyBox
- Receta de Docker: instalador oficial (`get.docker.com`) en Debian/Ubuntu con respaldo al paquete `docker.io` en derivadas; repositorio oficial `docker-ce` en RHEL, Rocky, Alma y CentOS (el de Fedora solo en Fedora: Rocky también declara `fedora` en `ID_LIKE`); paquete de la distribución en openSUSE, Alpine y Arch. Engine, CLI, containerd, buildx y compose; se detecta por `dockerd`. Desinstalar: detiene `docker.socket`, `docker` y containerd, purga `docker*` y `containerd.io` con las dependencias sin uso (sin quitar `runc`, que usa Podman), borra `/var/lib/docker` (imágenes, contenedores, volúmenes, redes), configuración, repositorio y clave, `~/.docker`, el grupo docker, `docker0`, los puentes `br-<id>` y sus reglas de iptables; los datos de containerd solo si ya no queda containerd. Probado instalando y desinstalando sin restos en Ubuntu 24.04, Rocky Linux 9 y Alpine 3.20
- `install-status` con un grupo (`kubernetes`): dice qué distribución hay instalada y, de cada opción, si el sistema la admite. Los 92 comandos generados (6 gestores × 2 sistemas de arranque) pasan `sh -n` en dash y BusyBox; Kubernetes no se ha instalado de punta a punta en un servidor de prueba

---

## [Cloud 0.2.0] — 2026-10-11

Versión **menor** sobre 0.1.0: reproducción de video a tramos. Va junto con la app de escritorio 0.6.0.

### Añadido
- `POST /files/stream-ticket` (sesión): comprueba que el archivo existe y devuelve `{ url, type, size, expiresAt }` con un ticket JWT (`typ: 'stream'`, sección y ruta) de 6 h. Solo vale para ese archivo y deja de valer al cerrar la sesión que lo pidió; `AuthService.verify` lo rechaza como sesión
- `GET /files/stream?ticket=` (`StreamController`, sin `CloudAuthGuard` porque `<video src>` no manda `Authorization`; sin límite de peticiones): responde a `Range` de un tramo con 206 y `Content-Range`, al archivo entero con 200 y a un tramo fuera del archivo con 416. `Accept-Ranges: bytes`, `Cache-Control: private, max-age=3600`, `nosniff`; lectura en bloques de 256 KiB que se suelta si el reproductor corta la petición al saltar (`parseRange` y `openRange` en `files.service.ts`, tests en `range.spec.ts`)
- Tipos MIME de video y audio: `mov`, `m4v`, `mkv`, `avi`, `m4a`, `aac`, `ogg`, `flac`
- `GET /stats` (sesión): resumen para el dashboard del panel a partir de los árboles de Home y Backups (`files/stats.ts`, `aggregateStats`): archivos y bytes por sección y por tipo, actividad de 30 días por fecha de modificación (días vacíos a cero, UTC), los 5 archivos más grandes y `truncated` (nuevo `scanTree` en `tree.ts` dice si se pasó de `CLOUD_TREE_MAX_ENTRIES`). Se reutiliza 60 s por usuario y dos peticiones a la vez recorren el disco una sola vez. Tests en `stats.spec.ts`
- Cualquier formato de video con ffmpeg (`files/media-plan.ts`, `files/media.service.ts`; `ffmpeg` en la imagen Docker). ffprobe analiza el archivo (resultado recordado por ruta, tamaño y fecha) y `planPlayback` elige según lo que el webview declara (`client` en `stream-ticket`): `direct` (sin ffmpeg), `remux` (`-c copy` a MP4; audio a AAC si no es AAC/MP3) o `transcode` (libx264 `superfast` + `zerolatency`, CRF 23, hasta `CLOUD_TRANSCODE_MAX_HEIGHT` = 720, clave cada 2 s, AAC 160k). La salida es MP4 fragmentado por `GET /files/play?ticket&start`, con `-ss` de entrada para saltar
- Carga contenida: hilos por conversión (`CLOUD_TRANSCODE_THREADS`, por defecto la mitad de los núcleos), `nice` 10, como mucho `CLOUD_MAX_TRANSCODES` (2) conversiones a la vez (503 `TRANSCODE_BUSY`), contrapresión del socket (ffmpeg no adelanta más de lo que el reproductor lee) y una sola conversión por reproducción: saltar o cerrar mata la anterior. En un servidor de 2 núcleos, 720p va a ~1,6× tiempo real con video sintético
- Caché de conversiones: una conversión desde el principio vista entera se rehace con `+faststart` y se guarda en `CLOUD_MEDIA_CACHE_DIR` (por defecto `<CLOUD_DATA_DIR>/media-cache`) hasta `CLOUD_MEDIA_CACHE_BYTES` (10 GB), borrando lo menos visto. Después `stream-ticket` responde `direct` con `cached: true` y `/files/stream` sirve la copia a tramos. Los `.part` de un arranque anterior se borran al iniciar
- `GET /files/seek-point?ticket&t`: al re-empaquetar solo se puede empezar en un fotograma clave; devuelve el anterior a `t` (ffprobe con `-skip_frame nokey`) para que el reproductor muestre el tiempo exacto
- Sin ffmpeg instalado, todo va `direct` y `stream-ticket` responde `ffmpeg: false`

---

## [App de escritorio 0.6.0] — 2026-10-10

Versión **menor** sobre 0.5.1: el asistente de IA prepara altas de servidores y de conexiones a bases de datos. Va junto con el backend 0.8.0.

### Añadido
- Propuestas de alta del asistente (`components/assistant/assistantActions.ts`, `AssistantAction.tsx`): los bloques ```` ```startcode-servidor ```` y ```` ```startcode-conexion ```` con JSON se muestran como tarjeta con los datos en lugar de como código. `parseAction` solo deja pasar campos conocidos y valores válidos (sistema operativo, motor, etiqueta, puerto 1–65535); si el JSON no es válido, se ve como un bloque normal
- «Revisar y crear» cierra el panel (va por encima de los modales) y abre `AddServerModal` o `ConnectionModal` rellenados con la propuesta; ambos aceptan `initial`. La llave SSH y la contraseña las escribe el usuario en el formulario: nunca pasan por el modelo y nada se crea sin guardarlo
- Visor de imágenes en el lector de Cloud (`components/cloud/ImageView.tsx`): las imágenes pasan a `isPreviewable` y se abren con doble clic o «Abrir». Empiezan ajustadas a la ventana sin agrandar las pequeñas (se reajustan con `ResizeObserver`); rueda para zoom hacia el puntero (5 %–1600 %), arrastrar para mover, doble clic para alternar ajustada/ampliada, barra con alejar, porcentaje (tamaño real), acercar, ajustar, dimensiones y posición. Teclas `+` `−` `0` `1`, y `←` `→` para recorrer las imágenes de la carpeta abierta en el orden visible (con filtros), en círculo. El blob se muestra por URL de objeto, que se libera al cerrar o cambiar de imagen; los SVG se fuerzan a `image/svg+xml`; un formato que el webview no decodifica (p. ej. HEIC en Windows) muestra «Sin vista previa». CSP: `img-src` admite `blob:`
- Reproductor de video en el lector de Cloud (`components/cloud/VideoView.tsx`): los videos pasan a `isPreviewable`. No se descargan como blob: `cloudApi.streamUrl` pide un ticket a la nube y `<video>` reproduce desde `GET /files/stream` a tramos (`Range`), con `preload="metadata"`, así empieza enseguida y saltar solo pide ese punto. Controles propios sobre `glass-float`: reproducir/pausa (también clic en el video y botón central con `grad-brand`), ±10 s, barra de posición con lo ya cargado, tiempo, volumen (se recuerda en el equipo), velocidad 0,5×–2× y pantalla completa (doble clic o F): la ventana de Tauri pasa a pantalla completa (`setFullscreen`, permiso `core:window:allow-set-fullscreen`) y el reproductor, que vive en un nodo propio, se mueve al `<body>` para ocuparla sin volver a montarse ni cortar el video; Escape sale sin cerrar el lector y se sincroniza si se sale desde el sistema. La API Fullscreen del navegador no funcionaba en el webview. Se apartan solos tras 2,5 s sin mover el ratón. Teclado: espacio/K, ← → (5 s), J L (10 s), ↑ ↓, M, F. Indicador de carga mientras espera datos; un formato o códec no admitido (.avi, .mkv, HEVC según el sistema) muestra «Sin vista previa». No se recodifica: se reproduce el archivo original. CSP: `media-src 'self' blob: http://*:* https://*:*`. Requiere Cloud 0.2.0
- Servidores: el punto verde de métricas en vivo va pegado a la etiqueta de estado, en tarjetas y en lista. En las tarjetas el estado de conexión pasa al pie (a la izquierda, frente a los servicios activos) y se quita «Último reporte …»; el aviso de datos atrasados sigue en el tooltip de las métricas
- Cloud: las carpetas se abren con doble clic (o Enter), igual que los archivos; un clic ya no entra en la carpeta. En modo selección un clic sigue marcando
- Cargar carpetas (Cloud y SFTP, eligiendo o soltando) omite las de paquetes y cachés: `node_modules`, `bower_components`, `jspm_packages`, `.pnpm-store`, `venv`, `.venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.gradle` y cualquier entorno virtual de Python con otro nombre (tiene `pyvenv.cfg`). Lo elegido o soltado directamente no se omite aunque sea una de ellas. Un aviso dice cuántas y cuáles se dejaron fuera (`PickResult` con `skipped` y `describeSkipped` en `lib/filePicker.ts`)
- Cloud: selección múltiple. «Seleccionar» está en el menú del clic derecho: en cualquier parte de la columna de contenido (con «Seleccionar todo», «Nueva carpeta», «Cargar archivos» y «Cargar carpeta»; en modo selección, «Seleccionar todo»/«Quitar la selección» y «Salir de la selección») y en cada elemento, que entra al modo con ese elemento ya marcado (en modo selección, «Marcar»/«Desmarcar»). Pone casillas (`.chk`) en el mosaico y la lista; un clic marca o desmarca (también carpetas, que no se abren) y Ctrl + A marca todo lo visible. La barra de selección muestra cuántos y cuánto ocupan, «Todo», y las acciones Compartir por SFTP, Mover y Eliminar; con el clic derecho sobre un elemento marcado salen las mismas en lote. Se sale con la X, al cambiar de carpeta o al terminar un mover o eliminar. `DeleteEntryModal`, `MoveEntryModal` (bloquea destinos dentro de cualquiera de las carpetas y avisa del primer nombre que chocaría) y `ShareSftpModal` reciben `entries`; mover y eliminar van uno tras otro y si alguno falla el resto sigue y el aviso dice cuántos no se pudieron (`describeEntries` en `utils/cloud.ts`)
- Cloud: «Compartir por SFTP» en el menú contextual de archivos y carpetas (`components/cloud/ShareSftpModal.tsx`, icono `send` en `MenuIcon`). Se elige uno de los servidores registrados (buscador, en línea primero, estado, etiqueta y `usuario@host`) y se abre `SftpModal` en modo envío (`incoming`): se navega hasta la carpeta de destino y «Enviar aquí» encola los archivos en la cola de subida de SFTP (progreso, conflictos, sobrescribir y reintentos). Las carpetas mantienen su estructura; cada archivo se pide a la nube al subirlo. Pasa por la app (nube → app → backend → servidor); no se envía dos veces a la misma carpeta sin querer
- Videos de cualquier formato: `cloudApi.stream` envía lo que el webview reproduce (`canPlayType` de HEVC, VP9, AV1 y WebM) y recibe `mode`. En `remux`/`transcode` el reproductor va «en vivo»: la duración la da la nube, saltar pide el punto real (`cloudApi.seekPoint`) y vuelve a cargar con `&start=`, el tiempo y lo cargado suman ese desfase, la barra salta al soltar y los saltos seguidos con el teclado se juntan (350 ms). Etiqueta «Convertido al vuelo» al convertir y mensajes de error según el caso (sin ffmpeg, nube ocupada, formato no admitido)
- Controles del reproductor rediseñados: la barra va en su propia superficie con el tiempo a los lados; cada botón es una pieza independiente y redonda (`glass-media`, superficie translúcida nueva con `--glass-media-alpha` por tema, con borde que se acentúa al pasar, activos con `grad-brand-soft`), reproducir/pausa con `grad-brand` y el volumen se despliega dentro de su pieza. Botón central redondo con la marca (y «volver a ver» al terminar), aviso «+10 s / −10 s» al saltar y spinner con el color del tema
- `RangeSlider` pasa a `components/common/RangeSlider.tsx` (lo usaba solo Configuración) con `step`, `onCommit`, `buffered` (tinte de marca), `tooltip` (valor bajo el puntero, el tiempo en la barra de video) y la variante `compact`. El gradiente de marca ocupa toda la pista y se recorta según la posición. `DESIGN.md` actualizado

### Corregido
- Exportar resultados (CSV/XLSX) en la app compilada: el webview ignora `<a download>`, así que `downloadBlob` (`lib/download.ts`) abre siempre el diálogo nativo (la app es solo de escritorio: sin camino web) de guardar (`@tauri-apps/plugin-dialog` `save`) y escribe con `plugin-fs` `writeFile`. Devuelve la ruta o null si se cancela. Permisos nuevos `dialog:allow-save` y `fs:allow-write-file` en `capabilities/default.json`; la ruta elegida entra sola en el alcance de `fs`
- `ExportMenu` avisa «Consulta exportada» con las filas y dónde quedó, o el error si falla. Las descargas de Cloud usan el mismo camino
- Exportar un resultado recortado trae todas las filas: `ResultGrid` repite la consulta con `databasesApi.exportQuery` (la recibe de `DatabaseDetail` por `QueryResults`, prop `query`) y enmascara las columnas ocultas igual que la tabla. El botón muestra «Exportando…» y, si el backend también recorta, el aviso dice cuántas filas salieron de cuántas

### Corregido (desarrollo)
- Lector de PDF en `pnpm dev`: pdf.js se importa de forma dinámica y Vite lo descubría tarde; al re-optimizar las dependencias con la app abierta (por ejemplo, al añadir un paquete) el webview mezclaba módulos de dos optimizaciones y `GlobalWorkerOptions` llegaba `undefined`. `optimizeDeps.include: ['pdfjs-dist']` lo pre-empaqueta al arrancar
- El lector de Cloud muestra el motivo real cuando no puede abrir un archivo (y lo deja en la consola), en lugar de solo «No se pudo leer el archivo»

### Cambiado
- Dashboard con gráficas de Cloud y filas compartidas (rejilla de 12 columnas en pantallas grandes, una columna en las pequeñas):
  - CPU y memoria 24 h (8/12) junto a «Almacenamiento de la nube» (4/12): disco de la nube con `MetricBar` y el reparto entre Home y Backups (tamaño, archivos y porcentaje de lo guardado)
  - «Actividad de la nube · últimos 30 días» (7/12): columnas por día con los archivos nuevos o modificados; el tooltip da el día, los archivos y su tamaño
  - «Espacio por tipo de archivo» (5/12): barras horizontales de mayor a menor con el tamaño al final de cada barra; el tooltip suma los archivos
  - «Salud por servidor» (8/12) y, al lado, «Capacidad y avisos» y «Archivos más grandes» (top 5; abre Cloud)
  - Sin nube conectada, sin respuesta o con una nube anterior a 0.2.0 (404 en `/stats`), cada tarjeta lo explica con el estado vacío
  - Una serie por gráfica y un solo eje, color de marca del tema (`var(--brand-1)`→`var(--brand-2)`), rejilla `--hairline-soft`, barras con extremos de 4 px. `TOOLTIP_STYLE` y los ejes pasan a `components/dashboard/chartStyles.ts`, y `Empty`/`SectionTitle` a `components/dashboard/DashboardParts.tsx`; las tarjetas en `components/dashboard/CloudCharts.tsx`. `useCloudStats` en `useCloudData.ts` (clave bajo `CLOUD_KEYS`, 60 s)
- Terminal SSH del detalle de servidor:
  - Siempre apaisada (16:9): ancho hasta 1280 px, limitado por el ancho y por el alto de la ventana
  - Convive con el asistente: abierto, la terminal se encoge y se centra en el espacio que deja libre a la derecha (440 px y márgenes), sin quedar debajo
  - La sesión persiste: cerrar la ventana solo la oculta (la conexión SSH sigue y al volver está como se dejó); «Terminar sesión» la cierra y salir del detalle del servidor también. El botón pasa a «Volver a la terminal» con un punto verde mientras hay sesión. Oculta no se ofrece al asistente
- La app es solo de escritorio: fuera las ramas y respaldos para navegador (`IS_TAURI` desaparece)
  - `lib/filePicker.ts` es un único módulo con funciones (`pickFiles`, `pickDirectory`, `filesFromDrop`); se borran `filePicker.web.ts` y `filePicker.tauri.ts`. Soltar en SFTP ya no hace un `await` antes de leer el `DataTransfer` (podía llegar vacío)
  - `tauriStore` sin `localStorage`/`sessionStorage`; notificaciones solo por el plugin y los comandos de macOS (fuera la API `Notification` del navegador); versión de la app siempre con `getVersion`; cabecera `X-StartCode-Client` siempre; el actualizador sin comprobaciones de entorno
  - Portapapeles con `@tauri-apps/plugin-clipboard-manager` (nueva dependencia, permisos `clipboard-manager:allow-read-text` y `allow-write-text`) en lugar de `navigator.clipboard` y el respaldo con `execCommand('copy')`
  - Los enlaces del Markdown de Cloud se abren en el navegador del sistema con `@tauri-apps/plugin-opener` (nueva dependencia, `opener:allow-open-url`); `target="_blank"` no hacía nada en el webview
  - Configuración: descargar los códigos de respaldo de 2FA y exportar la configuración usan el diálogo de guardar (`downloadBlob`); con `<a download>` no se guardaba nada
- Al abrir el asistente se baja al final de la conversación sin animación (`useLayoutEffect` sobre `open`); antes, con la conversación en caché, se quedaba arriba
- Textos del panel del asistente: la bienvenida menciona las altas y el pie dice que las altas propuestas las confirma el usuario

---

## [0.8.0] — 2026-10-10

Versión **menor** sobre 0.7.0. Va junto con la app de escritorio 0.6.0.

### Añadido
- Prompt del asistente: puede proponer el alta de un servidor o de una conexión con un bloque `startcode-servidor` o `startcode-conexion` (JSON con los campos de `CreateServerDto` y `CreateDatabaseConnectionDto`, sin llave ni contraseña). Debe pedir el host si falta y avisar si ya existe en los datos del panel. Sigue sin herramientas: el backend no crea nada desde el asistente
- `POST /databases/:id/query/export` (10/min): repite la consulta sin el tope de 1000 filas de la vista, hasta `EXPORT_MAX_ROWS` (200 000) con `truncated` si había más. Solo consultas de lectura (`isReadOnlyQuery` en `query-policy.ts`: SELECT, WITH, SHOW, DESCRIBE, EXPLAIN sin ANALYZE, VALUES, TABLE; rechaza `INTO` y los CTE que modifican); las demás responden 400 para no repetir su efecto. `runQuery` de los dos exploradores acepta `maxRows`

### Corregido
- Salida a internet detrás de una VPN (`src/network-defaults.ts`, importado primero en `main.ts`): resolución IPv4 primero (`dns.setDefaultResultOrder`) y 2,5 s por intento de conexión en lugar de 250 ms (`net.setDefaultAutoSelectFamilyAttemptTimeout`). Ajustables con `NET_IP_ORDER=verbatim` y `NET_ATTEMPT_TIMEOUT_MS`. Para un proxy: `HTTPS_PROXY` con `NODE_USE_ENV_PROXY=1`
- Anthropic: un corte de conexión (`APIConnectionError`) ya no se informa como «respondió con un error (sin estado)», y el tiempo agotado del SDK se trata como proveedor no disponible
- Errores de red de los proveedores con el código de la causa (también anidado en `AggregateError`) y una pista para cada uno: DNS de la VPN, tiempo agotado, conexión rechazada o cortada, sin ruta, certificado interceptado (`NODE_EXTRA_CA_CERTS`)

---

## [Cloud 0.1.0] — 2026-10-10

Primera versión del backend de StartCode Cloud, nuevo proyecto en `CLOUD/` (NestJS 11 + TypeScript), separado de `BACKEND/`. Va junto con la app de escritorio 0.5.0, que habla con él directamente.

### Añadido
- Archivos de **Home** y **Backups** tal cual en el disco del servidor; carpetas, fechas y tamaños se leen del sistema de archivos, sin base de datos. Estado interno (usuarios con hash bcrypt y sesiones) en JSON dentro de `CLOUD_DATA_DIR`, con escritura atómica (`state/state.store.ts`)
- Autenticación propia: `POST /auth/login` (5/min) devuelve un JWT HS256 de larga duración (`CLOUD_TOKEN_TTL`, 180 días por defecto) con `jti`; `POST /auth/logout` revoca la sesión aunque el token no haya expirado; `GET /auth/me`. `CloudAuthGuard` exige `Authorization: Bearer` de una sesión activa. Primer usuario desde `CLOUD_ADMIN_USERNAME`/`CLOUD_ADMIN_PASSWORD`; más con `pnpm user:add <usuario>` (`src/cli/user-add.ts`)
- `GET /health` público (`service: 'startcode-cloud'` y versión) para que el panel compruebe la URL
- Rutas de Home y Backups por usuario (`GET`/`PUT /config/paths`): mismas reglas que el panel y, además, siempre dentro de `CLOUD_ALLOWED_ROOTS`; se crean si no existen y se vuelven a comprobar ya resueltas (`realpath`)
- Archivos (`files/`): `GET /tree/:section` (árbol completo con ids relativos y tipo por extensión, tope `CLOUD_TREE_MAX_ENTRIES`), `GET /storage` (`statfs` del disco), `POST /folders`, `PUT /files` (subida en streaming con el cuerpo crudo a un temporal que se renombra al terminar; comprueba el tamaño declarado y `CLOUD_MAX_UPLOAD_BYTES`; reemplaza archivos del mismo nombre), `GET /files/content`, `GET /files/zip` (carpeta en .zip con `archiver`, en streaming), `PATCH /entries/rename`, `POST /entries/move` (también entre Home y Backups, con copia y borrado si están en discos distintos) y `DELETE /entries`
- Seguridad de rutas (`files/path-guard.ts`): rutas relativas validadas segmento a segmento (sin absolutas, `.`, `..` ni `/ \ : * ? " < > |`) y rechazo de cualquier camino que atraviese un enlace simbólico; la raíz de una sección no se puede renombrar, mover ni borrar. Errores del sistema de archivos traducidos al español con `{ code, message, hint }`
- CORS con `CORS_ORIGIN` más los orígenes de Tauri y la respuesta a la preflight de Private Network, como `BACKEND`; sin límite de tiempo por petición para subidas y descargas largas
- Tests con Jest (`path-guard`, árbol y validación de rutas), `Dockerfile`, `docker-compose.yml` (volúmenes de datos y almacenamiento), `.env.example` y `README.md` con despliegue y API

---

## [App de escritorio 0.5.0] — 2026-10-09

Versión **menor** sobre 0.4.0: tab Cloud. Trabaja con archivos reales en un backend de StartCode Cloud (`CLOUD/`, Cloud 0.1.0), al que el panel se conecta directamente.

### Añadido
- Vista **StartCode Cloud** (`pages/cloud/Cloud.tsx`, ruta `ROUTES.CLOUD` = `/cloud`): el ítem Cloud del sidebar deja de estar marcado como «Pronto» y abre la gestión de la nube en el mismo contenedor de la app, repartido en dos columnas 20/80 (`grid-cols-[minmax(0,1fr)_minmax(0,4fr)]`)
- Columna de navegación (`components/cloud/CloudSidebar.tsx`): marca «StartCode Cloud» con icono de nube, chip de la cuenta con solo el nombre de usuario y un icono pequeño de usuario (`CloudAccount.username`), secciones de la nube como tabs (**Home** y **Backups**, `CLOUD_SECTIONS` en `utils/cloud.ts`; pulsar un tab lo abre en su raíz) y, al pie, el almacenamiento (espacio disponible y total, porcentaje y barra con el gradiente de marca del tema sobre `bg-track`; lo ocupado y el total del disco de la nube, `GET /storage`) y la etiqueta de estado de conexión con la nube (Conectado, Conectando…, Desconectado)
- Explorador de archivos (`components/cloud/CloudExplorer.tsx`) en la columna de contenido:
  - Migas de pan desde Home que siguen la carpeta abierta; cada tramo anterior vuelve a esa carpeta
  - Barra de filtros: **Tipo** (carpetas o un tipo de archivo), **Fecha** de creación (hoy, esta semana, este mes, este año) y **Modificado** por lapso (última hora, 24 horas, 7 días, 30 días, más de 30 días), con «Limpiar» cuando hay alguno activo. Los filtros se conservan al cambiar de carpeta
  - Al otro extremo, buscador por nombre en la carpeta abierta (sin distinguir mayúsculas ni tildes, `query` en `CloudFilters`; Escape lo vacía y «Limpiar» también) y botón **Nueva carpeta**, que abre un modal con el nombre validado (`folderNameError`: vacío, más de 120 caracteres, `/ \ : * ? " < > |` o repetido en la carpeta) y crea una carpeta vacía en la abierta, con un aviso de Cloud
  - Junto a ellos, cambio entre **mosaico** (por defecto) y **lista** (nombre, tipo, tamaño y modificación relativa)
  - La lista se separa en grupos colapsables, todos desplegados por defecto: carpetas y luego uno por tipo de archivo (Word, Excel, PowerPoint, PDF, imágenes…), cada uno con su número de elementos (`groupEntries` y `CLOUD_GROUP_LABELS` en `utils/cloud.ts`). Lo plegado se conserva al cambiar de carpeta o de vista. Los elementos de cada grupo van sangrados bajo su encabezado con guías de árbol (vertical y conector por fila, la última cortada a media altura)
  - El mosaico se separa por los mismos grupos: cada bloque lleva como separador el icono y el nombre del tipo, su número de elementos y una línea que se desvanece hacia la derecha
  - Orden por defecto: primero carpetas y luego archivos, cada grupo por nombre (`visibleEntries` en `utils/cloud.ts`). Las carpetas se abren con un clic (o Enter en la lista)
  - Iconos por tipo (`FileGlyph`, `FolderGlyph` en `components/cloud/icons.tsx`): Word, Excel, PowerPoint y PDF con su letra y color; imágenes, video, audio, comprimidos, código y texto con su dibujo. Colores de las familias remapeadas por tema
- Componente `Select` (`components/common/Select.tsx`): desplegable propio con el aspecto de la app en lugar del `<select>` nativo, cuya lista dibuja el sistema y no sigue el tema. Lista en portal con `glass-float`, que se abre hacia arriba si abajo no cabe, check en la opción elegida, texto secundario opcional (`hint`) y manejo con teclado (flechas, Inicio/Fin, Enter, Escape, salto por letra). Documentado en `DESIGN.md`
- Menú contextual propio en toda la app (`ContextMenuProvider` en `AppProviders`, `components/common/ContextMenu.tsx`, `hooks/useContextMenu.ts`, `lib/textEditing.ts`): el clic derecho ya no abre el menú del sistema
  - Cada componente puede dar sus opciones con `useContextMenu().openContextMenu`; si no, sobre texto aparecen Cortar, Copiar y Pegar según haya selección y el campo sea editable (las contraseñas no se copian ni se cortan), y en el resto no aparece nada
  - Cortar y pegar usan `execCommand` para conservar el deshacer del campo y avisar a React; si el webview niega el portapapeles, un aviso sugiere el atajo de teclado
  - Cloud: clic derecho en una carpeta o un archivo ofrece **Descargar**: los archivos se descargan tal cual y las carpetas comprimidas en .zip por la nube
  - Terminal SSH: Copiar la selección de xterm y Pegar en la sesión
  - En desarrollo, Mayús + clic derecho deja el menú del navegador para inspeccionar
- Avisos propios de Cloud (`components/cloud/CloudToasts.tsx`, `hooks/useCloudNotices.ts`): se muestran abajo y centrados dentro de la columna de contenido (80 %), con `glass-float`, en lugar de en la esquina de la ventana. Los informativos duran 5 s
- Cargar arrastrando: al arrastrar carpetas o archivos del sistema sobre la columna de contenido aparece «Suelta para cargar» con la carpeta de destino (solo con archivos, no con texto arrastrado). Al soltar, los archivos se suben a la nube (tres a la vez) y un aviso muestra el progreso real (archivos, bytes y porcentaje); al terminar queda 10 s con la confirmación y lo cargado aparece en la carpeta, combinando carpetas del mismo nombre y reemplazando archivos. Si algo falla, el aviso de progreso se cambia por el error. Soltar en la columna de navegación no hace nada, en vez de que el webview abra el archivo
- Lector de archivos (`components/cloud/FileViewerModal.tsx`): doble clic en un archivo Word, Excel, PDF, texto o código abre un modal grande con el nombre en la cabecera y **Descargar** junto a Cerrar. Los demás tipos avisan que no tienen vista previa
  - Word (.docx) y Excel (.xlsx) se leen en la app con `fflate` y `DOMParser` (`lib/fileViewer/office.ts`), sin librerías de ofimática: títulos, negritas, cursivas, listas y tablas del documento; hojas como pestañas con columnas por letra y filas numeradas (tope de 1000 filas y 60 columnas). Los formatos antiguos (.doc, .xls) muestran «Sin vista previa» con la opción de descargar
  - PDF con `pdfjs-dist` (nueva dependencia, `lib/fileViewer/pdf.ts`), cargado solo al abrir un PDF; el worker va como archivo de la app, sin tocar la CSP. Cada página en un canvas al ancho del lector
  - Texto y código en monoespaciada (tope de 500 000 caracteres)
  - Markdown (`.md`, `.markdown`) interpretado (`components/cloud/MarkdownView.tsx`, con `react-markdown` y `remark-gfm`, nuevas dependencias): títulos, listas y listas de tareas, tablas, citas, bloques de código, tachado y enlaces (se abren fuera de la app), con las clases del sistema de diseño. El HTML incrustado se ignora y las imágenes se muestran como etiqueta (la CSP no carga imágenes externas). Selector «Vista / Código» para ver el texto original
  - El contenido se pide a la nube (`GET /files/content`) al abrir el lector
- `Modal` admite `actions` (botones en la cabecera, a la izquierda del de cerrar, que ahora tiene `aria-label`), `tall` (todo el alto disponible, lo usa el lector) y `dismissable={false}` (sin botón de cerrar y sin cerrarse con Escape ni con el fondo)
  - Clic derecho en un archivo que el lector sabe mostrar ofrece **Abrir** antes de Descargar
- Carpetas fijadas (`hooks/useCloudPinned.ts`): clic derecho en una carpeta → **Fijar en el menú** la pone en la columna de navegación como subcarpeta de su sección (Home o Backups), con guías de árbol; un clic la abre (con su ruta completa en las migas) y se marca activa en lugar de la sección. Máximo 5 por sección (`MAX_PINNED_FOLDERS`): con el tope lleno la opción aparece desactivada. Se quita con **Quitar del menú**, desde la carpeta o desde la propia entrada fijada. Son una preferencia de este equipo (`STORAGE_KEYS.CLOUD_PINNED`); las que dejan de existir en la nube se retiran solas
- Tab **Backups**: mismo funcionamiento que Home (explorador, filtros, buscador, nueva carpeta, carga arrastrando, lector y carpetas fijadas) sobre su propio árbol. Cada sección recuerda su carpeta abierta al cambiar de tab y las migas empiezan con el icono de la sección. Las fijadas se guardan por sección; las guardadas antes como lista única se leen como de Home
- Configuración de Cloud: icono de engranaje en la fila del título «StartCode Cloud» que abre un modal (`components/cloud/CloudSettingsModal.tsx`) con dos pestañas:
  - **Conexión**: la primera vez se escribe la URL de la nube, el usuario y la contraseña (con un ojo para mostrarla u ocultarla); el panel comprueba `/health`, inicia sesión y guarda URL, usuario y token en el almacén del equipo (`hooks/useCloudConnection.ts`, `lib/tauriStore.ts`, `STORAGE_KEYS.CLOUD_CONNECTION`). Conectado muestra servidor, usuario y versión, y **Desconectar** cierra la sesión en la nube. Si la nube no responde, la conexión se conserva con «Reintentar» u «Olvidar conexión»; si rechaza el token, se olvida. Sin conexión (tras comprobar la guardada) lo primero que muestra Cloud es este modal, titulado «Conectar con StartCode Cloud», solo con la pestaña Conexión y sin poder cerrarse (ni con Escape, ni con el fondo, ni con un botón de cerrar) hasta conectar; «Volver al panel» lleva al Panel para no dejar la app bloqueada. Si se desconecta, vuelve a aparecer
  - **Rutas**: las carpetas de Home y Backups guardadas en la nube (`GET`/`PUT /config/paths`), con las carpetas permitidas del servidor a la vista. Validación (`cloudPathErrors`): ruta absoluta, distinta de `/`, sin `.` ni `..` ni caracteres no permitidos, y ninguna igual ni dentro de la otra; la nube además exige que estén dentro de sus carpetas permitidas y muestra su error. «Restablecer» vuelve a lo guardado
- Mover, cambiar nombre y eliminar carpetas y archivos desde el menú contextual (`components/cloud/EntryActionModals.tsx`), separados de las demás opciones; Eliminar en rojo
  - **Mover**: árbol de carpetas de Home y Backups para elegir el destino (se puede mover entre secciones); una carpeta no puede ir dentro de sí misma, y avisa si ya está ahí o si en el destino hay algo con el mismo nombre
  - **Cambiar nombre**: con el nombre seleccionado sin la extensión; un archivo con otra extensión cambia de tipo. Mismas reglas de nombre que Nueva carpeta (`entryNameError`)
  - **Eliminar**: confirmación que indica cuántos elementos contiene una carpeta
  - Cada acción se hace en la nube y muestra un aviso de Cloud con el resultado o el error
- **Detalles** en el menú contextual de carpetas y archivos (`components/cloud/EntryDetailsModal.tsx`): icono grande del tipo centrado (`FileGlyph` admite `size="xl"`), nombre, tipo y extensión, tamaño (legible y en bytes), fechas de carga y de modificación, ubicación en la sección y ruta en el servidor. En carpetas, además, tamaño total y contenido contando subcarpetas, recuento por tipo de archivo, último cambio dentro y si está fijada; en archivos, si se abre en el lector
- Menú contextual: las opciones admiten `separator` (línea encima) y `danger` (en rojo)
- Botones **Cargar archivos** y **Cargar carpeta** al final de la fila de las migas de pan: abren el explorador de archivos del sistema y cargan lo elegido en la carpeta abierta, con el mismo aviso de progreso que al arrastrar
  - En la app de escritorio el diálogo es el nativo de Tauri (`lib/filePicker.tauri.ts`): plugins `dialog` y `fs` (nuevas dependencias en `package.json` y `Cargo.toml`, registrados en `lib.rs`; permisos `dialog:allow-open`, `fs:allow-read-file`, `fs:allow-read-dir` y `fs:allow-stat` en `capabilities/default.json`). Lo elegido entra en el ámbito de `fs` (las carpetas con `recursive`), sin abrir lectura a todo el disco; el contenido se lee al subir cada archivo y los enlaces simbólicos se saltan. En el navegador sigue el `<input type="file">`
  - `getFilePicker` elige el proveedor según `IS_TAURI`, así que «Elegir archivos» y «Elegir carpeta» del modal SFTP también usan ahora el diálogo nativo en la app de escritorio
- Cliente de la nube (`services/cloud.api.ts`): instancia de axios propia con la URL y el token de la conexión guardada, errores `CloudApiError` con el formato de `ApiError` (también los que llegan como Blob en las descargas) y aviso a la conexión cuando la nube rechaza el token. Árboles, almacenamiento y rutas con React Query (`hooks/useCloudData.ts`, claves por servidor y usuario) que se refrescan tras cada cambio. Tipos en `types/cloud.types.ts`

### Cambiado
- Los modales nunca superan el alto de la ventana y dejan siempre 48 px arriba y abajo (`py-12` en el overlay y `max-h-full`, en vez de `max-h-[88vh]` con `p-4`/`p-6`)
- Versión de la app a 0.5.0 en `FRONTEND/package.json`, `tauri.conf.json` y `Cargo.toml`
- La barra superior muestra `startcode://cloud` en la vista Cloud
- Dashboard: el indicador **Cloud** deja de estar en «Próximamente»: muestra el espacio usado sobre el total del disco de la nube («62,4 GB/100 GB», `GET /storage`) y debajo el estado de la conexión (en línea con el servidor, conectando, sin respuesta o sin conectar). `Kpi` acepta un valor con marcado
- Todos los selects nativos pasan a `Select`: servidor de la gráfica del Panel, intervalo de actualización y modelo del asistente en Configuración (el id del modelo va como texto secundario), sistema operativo al agregar y editar un servidor, y los filtros de Cloud
- El asistente de IA no está disponible en la vista Cloud: `AppLayout` oculta el botón **Asistente** y no monta `AssistantPanel` en `/cloud`, y si el panel venía abierto lo cierra al entrar

---

## [0.6.0] — 2026-10-09

Versión **menor** sobre 0.5.0: asistente de IA por usuario. Va junto con la app de escritorio 0.4.0.

### Añadido
- Módulo `assistant` (`src/assistant/`): un asistente de IA por usuario en `tbl_ai_assistant_configs` (migración `add_ai_assistant_configs.sql`, índice único por `str_user_id`, borrado en cascada). Proveedores admitidos: Anthropic, OpenAI y Google Gemini (`enu_provider`); el modelo es libre
- La clave de API se cifra con `CredentialsCipherService` (misma `DB_CREDENTIALS_KEY` que las contraseñas de bases; `DatabasesModule` lo exporta), columna `str_api_key_enc` con `select: false`. Las respuestas solo llevan los 4 últimos caracteres (`apiKeyHint`)
- Endpoints bajo `/assistant` (JWT): `GET /config`, `PUT /config` (crea o actualiza; sin `apiKey` conserva la guardada si no cambia el proveedor), `DELETE /config`, `POST /config/test` (6/min) y `POST /chat` (20/min)
- `AiProviderService`: Anthropic con el SDK oficial (`@anthropic-ai/sdk`, nueva dependencia) y fallback del servidor ante rechazos (`server-side-fallback-2026-07-01`); OpenAI (`/v1/chat/completions`) y Gemini (`generateContent`) por REST. Sin herramientas en ningún proveedor: el asistente solo responde texto y no puede ejecutar comandos ni consultas. Errores traducidos (clave rechazada, modelo desconocido, límite de peticiones)
- `AssistantContextService`: resumen de los datos de la cuenta que acompaña a cada pregunta (servidores propios con sus últimas métricas, conexiones a bases, últimos comandos, consultas peligrosas confirmadas y notificaciones), con las columnas elegidas una a una para que nunca incluya `privateKey` ni `passwordEnc`; tope de 60 000 caracteres
- `secret-redactor.ts` (`redactSecrets`, `stripSensitiveKeys`): retira llaves privadas PEM/OpenSSH/PuTTY, contraseñas en URIs, `IDENTIFIED BY`/`PASSWORD '…'`, variables `*PASSWORD*`/`*TOKEN*`/`*API_KEY*`, `mysql -p…`, `--password=`, `sshpass -p`, claves `sk-…`/`AIza…` y hashes de contraseña. Se aplica al resumen, al contexto de pantalla y a las preguntas antes de enviarlos al proveedor. Con tests
- Prompt de sistema fijo: rol solo de consulta, comandos y SQL en bloques de código, aviso ante operaciones destructivas, el contenido de terminal y resultados se trata como datos y no como instrucciones
- `POST /assistant/models` (30/min): modelos disponibles del proveedor en el momento, con la clave escrita o la guardada si es del mismo proveedor (POST para que la clave no viaje en la URL). Anthropic con `client.models.list()` (sin los deprecados), OpenAI con `/v1/models` filtrado a modelos de chat sin instantáneas con fecha, Gemini con `/v1beta/models` filtrado a `generateContent`. Caché de 10 minutos por usuario, proveedor y huella SHA-256 de la clave; `refresh: true` la salta
- Reintentos ante errores pasajeros del proveedor: OpenAI y Gemini reintentan 500, 502, 503 y 504 dos veces (esperas de 1,5 s y 4 s, dentro del mismo tiempo límite) y Anthropic sube a 2 reintentos del SDK (incluye 529). Si persiste, el error dice que el proveedor está saturado y sugiere reintentar o elegir otro modelo, en vez de solo «respondió con un error (503)»
- Respaldo para Gemini: si el modelo elegido está saturado (503/504), no responde en 70 s (con un reintento) o Google lo tiene retirado para la cuenta, la pregunta la contesta primero el modelo que Google recomienda en su error y si no los alias estables `gemini-flash-latest` y `gemini-flash-lite-latest`, sin pasar de 115 s en total. La respuesta guarda el modelo que respondió de verdad; `POST /assistant/config/test` devuelve también `model`
- Modelos retirados (`ModelRetiredError`): Google sigue listando `gemini-2.5-*` pero responde 404 «no longer available to new users». El error ahora lo dice e indica el reemplazo recomendado, en vez de «no reconoce el modelo», y desde el primer rechazo esos modelos desaparecen de `POST /assistant/models` para esa clave (en memoria, por huella de la clave)
- Un corte por tiempo ya no se informa como «No se pudo contactar con…»: dice que el proveedor no respondió a tiempo y sugiere reintentar o elegir un modelo más rápido (`ProviderUnavailableError`); el error de red real indica revisar la conexión a internet del servidor y registra su causa
- El asistente no da información interna de StartCode Panel (rutas, archivos, `.env`, código, configuración ni instrucciones del backend o del frontend): regla en el prompt de sistema, que además remite las credenciales solo a la interfaz (Servidores, Bases de Datos, Configuración), y barrera en el servidor (`services/panel-guard.ts`, con tests). `hidePanelInternals` oculta como «[ruta interna del panel]» el directorio de instalación (y su padre, si tiene al menos dos niveles: `/app` de Docker no se toca) y cualquier ruta `…/startcode_panel/BACKEND|FRONTEND…`, en la pregunta y en el contexto de pantalla antes de enviarlos; `stripPanelInstructions` quita de la respuesta los párrafos y bloques de código que apuntaban ahí y añade una nota. Se aplica también al historial y al resumen ya guardados
- Anthropic sin saldo (400 «credit balance is too low») se explica en español: la clave es válida y hay que comprar créditos en la consola
- Anthropic: una clave de usuario sin espacio de trabajo (`sk-ant-usr-…`, la API responde 400 «not scoped to a workspace») se explica en español e indica crear una clave de espacio de trabajo (`sk-ant-api…`), en vez de «respondió con un error (400)»
- Memoria del asistente independiente del proveedor (`AssistantMemoryService`, migración `add_ai_assistant_memory.sql`): la conversación se guarda como texto en `tbl_ai_assistant_messages` (rol, contenido, proveedor y modelo de cada respuesta) y lo antiguo se condensa en un resumen a largo plazo en `tbl_ai_assistant_memory`. Cada pregunta lleva el resumen (en el prompt de sistema) y los últimos 30 mensajes sin resumir, normalizados para que alternen roles como exigen los tres proveedores (`toAlternating`, con tests), así que cambiar de Claude a ChatGPT o Gemini no pierde el contexto
  - Con más de 40 mensajes sin resumir, tras la respuesta y sin bloquearla, el proveedor del usuario condensa lo antiguo junto al resumen anterior (máx. 8 000 caracteres, sin secretos) y quedan 20 literales; se guardan como mucho 400 mensajes ya resumidos por usuario
  - Las preguntas se guardan ya pasadas por `redactSecrets`; los datos del panel y el contexto de pantalla van solo con la pregunta nueva y no se guardan. Si el proveedor falla, la pregunta se descarta para poder reintentar
  - `POST /assistant/chat` recibe solo `message` (y `context`) y devuelve la pregunta y la respuesta guardadas. Nuevos `GET /assistant/messages?limit=` (historial), `GET /assistant/memory` (resumen y número de mensajes) y `DELETE /assistant/memory` (borra conversación y resumen). Desconectar el asistente (`DELETE /config`) conserva la memoria

---

## [App de escritorio 0.4.0] — 2026-10-09

Versión **menor** sobre 0.3.0: asistente de IA. Requiere el backend 0.6.0 (módulo `assistant`).

### Añadido
- Pestaña **Asistente IA** en Configuración (`AssistantPane` en `Settings.tsx`): elección de proveedor (Claude, ChatGPT, Gemini), modelo con sugerencias, clave de API (vacía conserva la guardada), interruptor de activo, «Probar conexión» y «Desconectar». `?tab=assistant` abre la pestaña directamente
- Panel del asistente (`components/assistant/AssistantPanel.tsx`, portal a `z-60` para verse con la terminal abierta), abierto con el botón **Asistente** de la barra superior y de la cabecera de la terminal (`AssistantLauncher`). Conversación en memoria, sugerencias iniciales, bloques de código con «Copiar» y botones para pegar en cada destino disponible
- Registro de fuentes y destinos (`contexts/AssistantContext.tsx`, `hooks/useAssistantBridge.ts`): cada pantalla ofrece qué puede leer el asistente y dónde puede pegar mientras está montada
  - Terminal SSH: lee las últimas 300 líneas del búfer; pega como una sola línea y sin Enter (`toSingleLine` en `utils/commands.ts`: une con `&&`, quita comentarios y caracteres de control)
  - Línea de comandos del servidor: lee los 10 últimos resultados; pega en la línea sin ejecutar
  - Vista de una base de datos: lee el editor, el último resultado (hasta 100 filas, columnas de secretos enmascaradas) y la estructura ya cargada en el árbol; pega debajo del texto del editor
- Las fuentes adjuntas se ven como chips en el panel y se pueden quitar con un clic
- El modelo se elige en un select con los modelos que el proveedor ofrece en ese momento para la clave (`useAssistantModels`): se recarga al cambiar de proveedor o de clave (con 600 ms de espera mientras se escribe), al volver a la ventana y cada 10 minutos, y el botón de actualizar salta también la caché del backend. Sin modelo elegido se toma el preferido del proveedor si está disponible, o el primero; un modelo guardado que ya no se ofrece se muestra como «(ya no disponible)» en vez de cambiarse sin avisar. `AI_PROVIDERS` deja la lista fija de modelos por un `preferred` (`gemini-flash-latest` para Gemini: los `gemini-2.5-*` ya no se dan a cuentas nuevas)
- Memoria persistente: el panel carga la conversación guardada en el backend (`useAssistantMessages`), así que sigue al recargar, en otro equipo o tras cambiar de proveedor; cada respuesta indica qué proveedor y modelo la escribió. La pregunta se muestra al instante y se retira si el proveedor falla (`useSendAssistantMessage`). El botón de papelera pasa a «Borrar memoria», con confirmación
- Sección **Memoria** en Configuración → Asistente IA: mensajes guardados, resumen a largo plazo de lo que recuerda y «Borrar memoria» con confirmación
- `types/assistant.types.ts`, `services/assistant.api.ts` y `hooks/useAssistant.ts` (consultas con el id del usuario en la clave)

### Cambiado
- Versión de la app a 0.4.0 en `FRONTEND/package.json`, `tauri.conf.json` y `Cargo.toml`

### Corregido
- Configuración → Sistema mostraba una versión anterior en la app web de desarrollo: `vite.config.ts` lee la versión de `tauri.conf.json` solo al arrancar y `src-tauri` está fuera del vigilante de Vite, así que subirla no se veía hasta reiniciar `pnpm dev`. Nuevo plugin `restartOnVersionChange` (solo en `serve`): sondea `tauri.conf.json` cada segundo y reinicia el servidor cuando cambia la versión
- La notificación de prueba «Novedades del producto» decía «StartCode Panel v0.2.0» escrito a mano; ahora toma la versión de la app (`VITE_APP_VERSION`, que `vite.config.ts` lee de `tauri.conf.json`)

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
