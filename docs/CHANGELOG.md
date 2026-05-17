# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Added

#### Backend
- Encriptación de contraseñas mejorada con bcrypt factor 12 (OWASP recomendado)
- Usuario administrador por defecto al inicializar la base de datos (`DefaultUserSeeder`)
- Variables de entorno para configurar credenciales del admin por defecto:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`
  - `DEFAULT_ADMIN_FIRSTNAME`
  - `DEFAULT_ADMIN_LASTNAME`

#### Frontend
- **Vista de Configuración** (`/settings`) con las siguientes secciones:
  - **Perfil**: Edición de nombre, apellido, email y cambio de contraseña
  - **Notificaciones**: Configuración de alertas por email y notificaciones de servidores (offline, CPU, memoria, disco)
  - **Seguridad**: Autenticación de dos factores (2FA), tiempo de inactividad, expiración de contraseña, sesiones activas
  - **Monitoreo**: Intervalo de actualización de métricas, umbrales de alerta (CPU/memoria/disco), retención de datos históricos
  - **Sistema**: Información del sistema, estado de la base de datos, acciones de mantenimiento
- Navegación desde el botón de configuración en el Header del dashboard
- Componentes reutilizables: `ToggleOption` (switches) y `SliderOption` (umbrales)
- Ruta protegida `/settings` agregada al sistema de rutas

## [0.1.0] - 2025-11-15

### Added

#### Backend (NestJS)
- **Sistema de Autenticación**
  - Login con JWT (access token + refresh token)
  - Registro de usuarios
  - Endpoint de perfil (`/auth/me`, `/auth/profile`)
  - Renovación de tokens (`/auth/refresh`)
  - Guards para protección de rutas (JwtAuthGuard)
  - Sistema de roles (admin, user, viewer)

- **Gestión de Servidores**
  - CRUD completo de servidores
  - Conexión SSH con clave privada
  - Estados de servidor: online, offline, maintenance, error, warning, pending, checking
  - Soporte para múltiples sistemas operativos: Ubuntu, CentOS, Debian, Fedora, Arch, Solaris, OpenBSD, NetBSD, FreeBSD
  - Almacenamiento de metadatos del servidor (CPU, memoria, disco, uptime)

- **Sistema de Monitoreo**
  - WebSockets para métricas en tiempo real (Socket.IO)
  - Servicio de datos del agente (`AgentDataService`)
  - Gateway de agente para comunicación bidireccional
  - Entidad `AgentMetrics` para almacenar métricas
  - Servicio de estado de servidor (`ServerStatusService`)

- **Infraestructura**
  - Configuración de TypeORM con PostgreSQL
  - Sistema de caché
  - Tareas programadas (cron jobs) con `@nestjs/schedule`
  - Documentación API con Swagger
  - Variables de entorno con `@nestjs/config`

#### Frontend (React + TypeScript)
- **Autenticación**
  - Página de login
  - Contexto de autenticación (`AuthContext`)
  - Provider de autenticación
  - Rutas protegidas y públicas
  - Servicios de autenticación (`auth.service.ts`, `auth.adapter.ts`)

- **Dashboard**
  - Vista principal del dashboard
  - Tarjetas de servidor (`ServerCard`)
  - Estadísticas generales (`Stats`)
  - Header con navegación
  - Componente de búsqueda

- **Gestión de Servidores**
  - Vista detallada de servidor (`ServerDetail`)
  - Modal para agregar servidores (`AddServerModal`)
  - Hook personalizado `useServerDetail`

- **Monitoreo en Tiempo Real**
  - Contexto de métricas en tiempo real (`RealtimeMetricsContext`)
  - Integración con WebSockets del backend

- **Componentes UI**
  - Modal reutilizable
  - Loading spinner
  - Indicador de conexión
  - Rutas de la aplicación (`AppRoutes`)
  - Página 404 (NotFound)

#### Modelo de Datos
- **Tabla `tbl_users`**
  - UUID como clave primaria
  - Campos: firstname, lastname, email, password (hasheado)
  - Rol (enum: admin, user, viewer)
  - Estado activo/inactivo
  - Timestamps de creación y actualización

- **Tabla `tbl_servers`**
  - UUID como clave primaria
  - Campos: name, host, port, username, privatekey (encriptada)
  - Estado del servidor (enum)
  - Sistema operativo (enum)
  - Metadatos en formato JSONB
  - Relación con usuario propietario
  - Timestamps de última verificación

### Security
- Contraseñas hasheadas con bcrypt
- JWT para autenticación stateless
- Claves privadas SSH almacenadas de forma segura (campo select: false)
- Guards de autorización por roles

## [0.0.1] - 2025-09-27

### Added
- Estructura básica del proyecto
- Configuración inicial de NestJS (backend)
- Configuración inicial de React (frontend)
- Configuración de ESLint y Prettier
- Configuración de Jest para testing

---

## Tipos de cambios

- `Added` para nuevas funcionalidades
- `Changed` para cambios en funcionalidades existentes
- `Deprecated` para funcionalidades que serán eliminadas próximamente
- `Removed` para funcionalidades eliminadas
- `Fixed` para corrección de errores
- `Security` para vulnerabilidades corregidas
