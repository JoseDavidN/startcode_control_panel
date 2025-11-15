# Estructura del Backend - StartCode Panel

Este documento describe la estructura y organización del backend del proyecto StartCode Panel, construido con NestJS.

## Estructura de Directorios

```
BACKEND/
├── src/                          # Código fuente principal
│   ├── main.ts                   # Punto de entrada de la aplicación
│   ├── app.module.ts             # Módulo raíz de la aplicación
│   ├── app.controller.ts         # Controlador raíz
│   ├── app.service.ts            # Servicio raíz
│   ├── app.controller.spec.ts    # Tests del controlador raíz
│   │
│   ├── auth/                     # Módulo de autenticación
│   │   ├── auth.module.ts        # Configuración del módulo de autenticación
│   │   ├── auth.controller.ts    # Endpoints de autenticación
│   │   ├── auth.service.ts       # Lógica de negocio de autenticación
│   │   ├── auth.controller.spec.ts   # Tests del controlador
│   │   ├── auth.service.spec.ts      # Tests del servicio
│   │   │
│   │   ├── jwt-auth/             # Autenticación JWT
│   │   │   ├── jwt-auth.guard.ts     # Guard para proteger rutas con JWT
│   │   │   └── jwt-auth.guard.spec.ts # Tests del JWT guard
│   │   │
│   │   └── roles/                # Gestión de roles
│   │       ├── roles.guard.ts        # Guard para verificar roles
│   │       └── roles.guard.spec.ts   # Tests del roles guard
│   │
│   ├── servers/                  # Módulo de servidores
│   │   ├── servers.module.ts     # Configuración del módulo de servidores
│   │   ├── servers.controller.ts # Endpoints para gestión de servidores
│   │   ├── servers.service.ts    # Lógica de negocio de servidores
│   │   ├── servers.controller.spec.ts # Tests del controlador
│   │   └── servers.service.spec.ts    # Tests del servicio
│   │
│   └── monitoring/               # Módulo de monitoreo
│       ├── monitoring.module.ts  # Configuración del módulo de monitoreo
│       ├── monitoring.controller.ts   # Endpoints de monitoreo
│       ├── monitoring.service.ts      # Lógica de negocio de monitoreo
│       ├── monitoring.controller.spec.ts # Tests del controlador
│       └── monitoring.service.spec.ts    # Tests del servicio
│
├── test/                         # Tests e2e (end-to-end)
│   ├── app.e2e-spec.ts          # Tests de integración
│   └── jest-e2e.json            # Configuración de Jest para e2e
│
├── node_modules/                 # Dependencias del proyecto
│
├── package.json                  # Configuración del proyecto y dependencias
├── pnpm-lock.yaml               # Lock file de pnpm
├── pnpm-workspace.yaml          # Configuración del workspace de pnpm
├── tsconfig.json                # Configuración de TypeScript
├── tsconfig.build.json          # Configuración de TypeScript para build
├── nest-cli.json                # Configuración de NestJS CLI
├── eslint.config.mjs            # Configuración de ESLint
├── README.md                    # Documentación principal
└── STRUCTURE.md                 # Este archivo
```

## Arquitectura de Módulos

El backend sigue la arquitectura modular de NestJS, con una clara separación de responsabilidades:

### 1. **Módulo Raíz (App)**
- **Responsabilidad**: Punto de entrada y configuración principal de la aplicación
- **Archivos**: `app.module.ts`, `app.controller.ts`, `app.service.ts`

### 2. **Módulo de Autenticación (Auth)**
- **Responsabilidad**: Gestión de autenticación y autorización de usuarios
- **Características**:
  - Autenticación basada en JWT
  - Sistema de roles y permisos
  - Guards para proteger rutas
- **Componentes**:
  - `AuthController`: Endpoints de login, registro, etc.
  - `AuthService`: Lógica de autenticación
  - `JwtAuthGuard`: Protección de rutas con JWT
  - `RolesGuard`: Verificación de roles de usuario

### 3. **Módulo de Servidores (Servers)**
- **Responsabilidad**: Gestión de servidores en el panel
- **Funcionalidades**:
  - CRUD de servidores
  - Configuración de servidores
  - Estado y métricas de servidores
- **Componentes**:
  - `ServersController`: API REST para servidores
  - `ServersService`: Lógica de negocio

### 4. **Módulo de Monitoreo (Monitoring)**
- **Responsabilidad**: Monitoreo y métricas del sistema
- **Funcionalidades**:
  - Recolección de métricas
  - Monitoreo de estado
  - Alertas y notificaciones
- **Componentes**:
  - `MonitoringController`: Endpoints de monitoreo
  - `MonitoringService`: Lógica de monitoreo

## Patrones y Convenciones

### Estructura de un Módulo
Cada módulo sigue el patrón estándar de NestJS:

```
modulo/
├── modulo.module.ts       # Configuración del módulo
├── modulo.controller.ts   # Controlador (endpoints HTTP)
├── modulo.service.ts      # Servicio (lógica de negocio)
├── modulo.controller.spec.ts  # Tests del controlador
└── modulo.service.spec.ts     # Tests del servicio
```

### Guards
Los guards se utilizan para proteger rutas y verificar permisos:
- **JwtAuthGuard**: Verifica la autenticación del usuario
- **RolesGuard**: Verifica los roles del usuario

### Testing
- **Unit Tests**: Archivos `.spec.ts` junto a cada archivo de código
- **E2E Tests**: Directorio `/test` con tests de integración
- **Framework**: Jest como runner de tests

## Tecnologías Utilizadas

- **Framework**: NestJS (Node.js)
- **Lenguaje**: TypeScript
- **Gestor de Paquetes**: pnpm
- **Testing**: Jest
- **Autenticación**: JWT (JSON Web Tokens)
- **Linting**: ESLint

## Puntos de Entrada

- **Desarrollo**: `pnpm run start:dev`
- **Producción**: `pnpm run start:prod`
- **Tests**: `pnpm run test`
- **E2E Tests**: `pnpm run test:e2e`

## Convenciones de Código

1. **Nomenclatura**: 
   - Archivos: `kebab-case.ts`
   - Clases: `PascalCase`
   - Variables/Funciones: `camelCase`

2. **Organización**:
   - Un módulo por funcionalidad
   - Separación de controladores y servicios
   - Guards y decoradores en subdirectorios

3. **Testing**:
   - Tests unitarios junto al código fuente
   - Tests e2e en directorio separado
   - Cobertura de tests recomendada

## Próximas Extensiones

Para expandir el backend, considera:
- Añadir nuevos módulos en `/src`
- Seguir el patrón modular existente
- Incluir tests para nuevas funcionalidades
- Documentar en este archivo los nuevos módulos

