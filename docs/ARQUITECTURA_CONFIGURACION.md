# Arquitectura de Almacenamiento de Configuración

Este documento describe la estrategia recomendada para almacenar los datos de configuración del panel de administración de servidores.

## Tabla de Contenidos

- [Resumen Ejecutivo](#resumen-ejecutivo)
- [Análisis de Datos de Configuración](#análisis-de-datos-de-configuración)
- [Arquitectura Propuesta](#arquitectura-propuesta)
- [Modelo de Datos](#modelo-de-datos)
- [Justificación Técnica](#justificación-técnica)
- [Implementación](#implementación)

---

## Resumen Ejecutivo

La configuración del sistema se divide en dos categorías principales:

| Categoría | Tabla Propuesta | Alcance |
|-----------|-----------------|---------|
| **Configuración de Usuario** | `tbl_user_settings` | Individual por usuario |
| **Configuración del Sistema** | `tbl_system_settings` | Global para toda la aplicación |

---

## Análisis de Datos de Configuración

### 1. Sección Perfil

| Campo | Almacenamiento | Justificación |
|-------|----------------|---------------|
| Nombre | `tbl_users.str_firstname` | Ya existe en el modelo de usuario |
| Apellido | `tbl_users.str_lastname` | Ya existe en el modelo de usuario |
| Email | `tbl_users.str_email` | Ya existe en el modelo de usuario |
| Contraseña | `tbl_users.str_password` | Ya existe en el modelo de usuario (hasheada) |

**Decisión**: No se requiere nueva tabla. Usar la tabla `tbl_users` existente.

### 2. Sección Notificaciones

| Campo | Almacenamiento | Justificación |
|-------|----------------|---------------|
| Alertas por email | `tbl_user_settings` | Preferencia individual del usuario |
| Servidor desconectado | `tbl_user_settings` | Cada usuario decide qué alertas recibir |
| Uso alto de CPU | `tbl_user_settings` | Preferencia individual |
| Uso alto de Memoria | `tbl_user_settings` | Preferencia individual |
| Uso alto de Disco | `tbl_user_settings` | Preferencia individual |
| Alertas de seguridad | `tbl_user_settings` | Preferencia individual |

**Decisión**: Nueva tabla `tbl_user_settings` con relación 1:1 con `tbl_users`.

**¿Por qué configuración por usuario?**
- En un entorno multi-usuario, cada administrador tiene diferentes responsabilidades
- Un administrador de infraestructura puede querer alertas de CPU/memoria
- Un administrador de seguridad puede solo querer alertas de seguridad
- Evita spam de notificaciones innecesarias a usuarios que no las necesitan

### 3. Sección Seguridad

| Campo | Almacenamiento | Justificación |
|-------|----------------|---------------|
| 2FA habilitado | `tbl_users.bol_2fa_enabled` | Estado de seguridad del usuario específico |
| Secreto 2FA | `tbl_users.str_2fa_secret` | Clave TOTP única por usuario |
| Timeout de sesión | `tbl_system_settings` | Política global de seguridad |
| Expiración de contraseña | `tbl_system_settings` | Política global de seguridad |

**Decisión**: Mixta.
- 2FA → Agregar campos a `tbl_users` (es específico de cada usuario)
- Políticas de seguridad → `tbl_system_settings` (aplican a todos)

**¿Por qué las políticas son globales?**
- Las políticas de seguridad deben ser consistentes en toda la organización
- Un timeout de sesión de 30 minutos debe aplicar a todos los usuarios
- La expiración de contraseña es una política corporativa, no una preferencia personal
- Facilita auditorías de seguridad y cumplimiento normativo (ISO 27001, SOC 2)

### 4. Sección Monitoreo

| Campo | Almacenamiento | Justificación |
|-------|----------------|---------------|
| Intervalo de actualización | `tbl_system_settings` | Afecta recursos del servidor |
| Umbral de CPU | `tbl_system_settings` | Define cuándo alertar globalmente |
| Umbral de Memoria | `tbl_system_settings` | Define cuándo alertar globalmente |
| Umbral de Disco | `tbl_system_settings` | Define cuándo alertar globalmente |
| Días de retención | `tbl_system_settings` | Política de almacenamiento global |

**Decisión**: Tabla `tbl_system_settings` (configuración global).

**¿Por qué configuración global?**

1. **Intervalo de actualización**:
   - Afecta directamente la carga del servidor
   - Si cada usuario pudiera configurarlo, 10 usuarios con 5 segundos generarían 120 requests/minuto
   - Debe ser controlado centralmente para optimizar recursos

2. **Umbrales de alerta**:
   - Definen el estado de salud de los servidores de manera objetiva
   - Un servidor con 90% de CPU está en estado crítico para todos, no solo para algunos
   - Permite dashboards consistentes y métricas comparables

3. **Retención de datos**:
   - Afecta el espacio en disco de la base de datos
   - Tiene implicaciones de costos (almacenamiento)
   - Puede tener requisitos legales/compliance

### 5. Sección Sistema

| Campo | Almacenamiento | Justificación |
|-------|----------------|---------------|
| Versión | Código/Variables de entorno | No se guarda, se lee del sistema |
| Entorno | Variables de entorno | `NODE_ENV` |
| API URL | Variables de entorno | `VITE_API_URL` |
| Limpiar caché | N/A | Acción, no configuración |
| Exportar configuración | N/A | Acción, no configuración |

**Decisión**: No requiere almacenamiento. Son datos de solo lectura o acciones.

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Settings View                            │   │
│  │  ┌─────────┬──────────────┬──────────┬─────────────┐   │   │
│  │  │ Perfil  │Notificaciones│Seguridad │  Monitoreo  │   │   │
│  │  └────┬────┴──────┬───────┴────┬─────┴──────┬──────┘   │   │
│  └───────┼───────────┼────────────┼────────────┼──────────┘   │
│          │           │            │            │               │
└──────────┼───────────┼────────────┼────────────┼───────────────┘
           │           │            │            │
           ▼           ▼            ▼            ▼
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND API                               │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ /auth/     │  │ /settings/   │  │ /settings/system       │   │
│  │ profile    │  │ user         │  │ (solo admin)           │   │
│  └─────┬──────┘  └──────┬───────┘  └───────────┬────────────┘   │
│        │                │                      │                 │
└────────┼────────────────┼──────────────────────┼─────────────────┘
         │                │                      │
         ▼                ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                       BASE DE DATOS                               │
│                                                                   │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  tbl_users   │  │ tbl_user_settings│  │tbl_system_settings│  │
│  │              │  │                  │  │                   │  │
│  │ - firstname  │  │ - user_id (FK)   │  │ - key             │  │
│  │ - lastname   │  │ - email_alerts   │  │ - value           │  │
│  │ - email      │  │ - server_offline │  │ - type            │  │
│  │ - password   │  │ - high_cpu       │  │ - description     │  │
│  │ - 2fa_enabled│  │ - high_memory    │  │                   │  │
│  │ - 2fa_secret │  │ - high_disk      │  │ Ejemplos:         │  │
│  │              │  │ - security_alerts│  │ - session_timeout │  │
│  │              │  │                  │  │ - cpu_threshold   │  │
│  │              │  │                  │  │ - retention_days  │  │
│  └──────────────┘  └──────────────────┘  └───────────────────┘  │
│         │                   │                                    │
│         └─────────┬─────────┘                                    │
│              1:1  │                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Datos

### Modificaciones a `tbl_users`

```sql
ALTER TABLE tbl_users ADD COLUMN bol_2fa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE tbl_users ADD COLUMN str_2fa_secret VARCHAR(255) NULL;
```

### Nueva tabla: `tbl_user_settings`

```sql
CREATE TABLE tbl_user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relación con usuario (1:1)
    user_id UUID NOT NULL UNIQUE REFERENCES tbl_users(id) ON DELETE CASCADE,

    -- Configuración de notificaciones
    bol_email_alerts BOOLEAN DEFAULT TRUE,
    bol_notify_server_offline BOOLEAN DEFAULT TRUE,
    bol_notify_high_cpu BOOLEAN DEFAULT TRUE,
    bol_notify_high_memory BOOLEAN DEFAULT TRUE,
    bol_notify_high_disk BOOLEAN DEFAULT FALSE,
    bol_notify_security_alerts BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda rápida por usuario
CREATE INDEX idx_user_settings_user_id ON tbl_user_settings(user_id);
```

### Nueva tabla: `tbl_system_settings`

```sql
CREATE TABLE tbl_system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Clave única de configuración
    str_key VARCHAR(100) NOT NULL UNIQUE,

    -- Valor (almacenado como texto, se parsea según el tipo)
    str_value TEXT NOT NULL,

    -- Tipo de dato para validación y parsing
    enu_type VARCHAR(20) NOT NULL CHECK (enu_type IN ('string', 'number', 'boolean', 'json')),

    -- Descripción para documentación
    str_description TEXT,

    -- Categoría para agrupar settings
    str_category VARCHAR(50) DEFAULT 'general',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda por categoría
CREATE INDEX idx_system_settings_category ON tbl_system_settings(str_category);
```

### Datos iniciales para `tbl_system_settings`

```sql
INSERT INTO tbl_system_settings (str_key, str_value, enu_type, str_description, str_category) VALUES
-- Seguridad
('session_timeout', '30', 'number', 'Tiempo de inactividad para cerrar sesión (minutos)', 'security'),
('password_expiration', '90', 'number', 'Días hasta que expire la contraseña (0 = sin expiración)', 'security'),

-- Monitoreo
('metrics_refresh_interval', '30', 'number', 'Intervalo de actualización de métricas (segundos)', 'monitoring'),
('cpu_threshold', '80', 'number', 'Umbral de alerta de CPU (%)', 'monitoring'),
('memory_threshold', '85', 'number', 'Umbral de alerta de memoria (%)', 'monitoring'),
('disk_threshold', '90', 'number', 'Umbral de alerta de disco (%)', 'monitoring'),
('metrics_retention_days', '30', 'number', 'Días de retención de métricas históricas', 'monitoring');
```

---

## Justificación Técnica

### ¿Por qué no usar una sola tabla con JSON?

**Opción descartada**: Una tabla `settings` con columna JSONB para todo.

```sql
-- NO RECOMENDADO
CREATE TABLE settings (
    user_id UUID,
    data JSONB
);
```

**Problemas**:
1. **Sin validación de tipos**: JSON acepta cualquier estructura
2. **Difícil de consultar**: `WHERE data->>'cpu_threshold' > 80` es lento
3. **Sin valores por defecto**: Hay que manejarlos en código
4. **Migración compleja**: Cambiar estructura requiere scripts de migración de datos

### ¿Por qué no variables de entorno para todo?

**Variables de entorno son ideales para**:
- Secretos (JWT_SECRET, DB_PASSWORD)
- Configuración de infraestructura (DB_HOST, REDIS_URL)
- Configuración que cambia entre entornos (dev/staging/prod)

**No son ideales para**:
- Configuración que cambia en runtime sin reiniciar
- Configuración que debe persistir entre despliegues
- Configuración modificable desde la UI

### ¿Por qué relación 1:1 para user_settings?

**Alternativa**: Columnas directamente en `tbl_users`

```sql
-- ALTERNATIVA
ALTER TABLE tbl_users ADD COLUMN bol_email_alerts BOOLEAN;
ALTER TABLE tbl_users ADD COLUMN bol_notify_server_offline BOOLEAN;
-- ... muchas más columnas
```

**Problemas**:
1. **Tabla users inflada**: Mezcla datos de identidad con preferencias
2. **Consultas lentas**: Cargar usuario carga toda la configuración
3. **Separación de responsabilidades**: Settings puede crecer independientemente

**Ventajas de tabla separada**:
1. **Lazy loading**: Cargar settings solo cuando se necesitan
2. **Caché independiente**: Cachear settings sin invalidar usuario
3. **Auditoría separada**: Historial de cambios de settings vs cambios de perfil

### ¿Por qué key-value para system_settings?

**Alternativa**: Tabla con columnas fijas

```sql
-- ALTERNATIVA
CREATE TABLE system_settings (
    cpu_threshold INT,
    memory_threshold INT,
    session_timeout INT,
    -- ... una columna por setting
);
```

**Problemas**:
1. **Migración requerida**: Agregar nuevo setting = ALTER TABLE
2. **Solo un registro**: Desperdicio de estructura relacional
3. **Inflexible**: No permite settings dinámicos

**Ventajas de key-value**:
1. **Extensible**: Agregar setting = INSERT, no migración
2. **Autodocumentado**: Campo `description` explica cada setting
3. **Categorizable**: Agrupar por `category` para la UI
4. **Tipado**: Campo `type` permite validación correcta

---

## Implementación

### Entidades TypeORM

#### UserSettings Entity

```typescript
// src/settings/entities/user-settings.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('tbl_user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  // Notificaciones
  @Column({ name: 'bol_email_alerts', default: true })
  emailAlerts: boolean;

  @Column({ name: 'bol_notify_server_offline', default: true })
  notifyServerOffline: boolean;

  @Column({ name: 'bol_notify_high_cpu', default: true })
  notifyHighCpu: boolean;

  @Column({ name: 'bol_notify_high_memory', default: true })
  notifyHighMemory: boolean;

  @Column({ name: 'bol_notify_high_disk', default: false })
  notifyHighDisk: boolean;

  @Column({ name: 'bol_notify_security_alerts', default: true })
  notifySecurityAlerts: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

#### SystemSettings Entity

```typescript
// src/settings/entities/system-settings.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}

@Entity('tbl_system_settings')
export class SystemSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'str_key', unique: true, length: 100 })
  key: string;

  @Column({ name: 'str_value', type: 'text' })
  value: string;

  @Column({ name: 'enu_type', type: 'enum', enum: SettingType })
  type: SettingType;

  @Column({ name: 'str_description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'str_category', length: 50, default: 'general' })
  category: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Helper para obtener el valor tipado
  getTypedValue(): string | number | boolean | object {
    switch (this.type) {
      case SettingType.NUMBER:
        return parseFloat(this.value);
      case SettingType.BOOLEAN:
        return this.value === 'true';
      case SettingType.JSON:
        return JSON.parse(this.value);
      default:
        return this.value;
    }
  }
}
```

### Endpoints API

```
GET    /api/v1/settings/user          → Obtener settings del usuario actual
PUT    /api/v1/settings/user          → Actualizar settings del usuario actual

GET    /api/v1/settings/system        → Obtener settings del sistema (todos los usuarios)
PUT    /api/v1/settings/system        → Actualizar settings del sistema (solo admin)
GET    /api/v1/settings/system/:key   → Obtener un setting específico
```

### Permisos

| Endpoint | Rol Requerido |
|----------|---------------|
| `GET /settings/user` | Usuario autenticado |
| `PUT /settings/user` | Usuario autenticado (solo sus propios settings) |
| `GET /settings/system` | Usuario autenticado |
| `PUT /settings/system` | Admin |

---

## Próximos Pasos

1. **Crear migración** para las nuevas tablas
2. **Implementar entidades** TypeORM
3. **Crear módulo** `SettingsModule` con controlador y servicio
4. **Conectar frontend** con los nuevos endpoints
5. **Agregar validación** de tipos en el backend
6. **Implementar caché** para settings del sistema (Redis)
7. **Crear seeder** para valores por defecto

---

## Referencias

- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [TypeORM Relations](https://typeorm.io/relations)
- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
