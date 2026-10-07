# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

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
