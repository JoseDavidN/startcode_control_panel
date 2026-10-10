# Despliegue del backend en producción

El backend corre con `docker compose`: la API (NestJS), PostgreSQL y Redis (solo caché). Todo se ejecuta desde la carpeta `BACKEND/`.

## Archivos

| Archivo | Para qué |
|---|---|
| `Dockerfile` | Imagen multi-etapa: compila con las herramientas nativas que piden `ssh2`/`cpu-features` y deja una imagen final solo con `dist/`, dependencias de producción y `public/`, como usuario `node` |
| `docker-compose.yml` | Servicios `api`, `postgres` y `redis`; Postgres y Redis no publican puertos |
| `.env.production.example` | Variables de producción; copiar como `.env.production` |
| `docker/postgres/initdb/01-schema.sql` | Esquema completo de la base, generado desde las entidades |
| `docker/generate-schema.sh` | Regenera ese esquema |

## Primera instalación

```bash
cp .env.production.example .env.production
# Completar: contraseñas, JWT_SECRET, DB_CREDENTIALS_KEY, CORS_ORIGIN, PANEL_PUBLIC_URL, admin inicial
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 32   # DB_CREDENTIALS_KEY (no cambiarla nunca después)

# Artefactos del agente (instalador y binarios) en ./agent-dist, publicados por el repositorio del agente
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production logs -f api
```

Al crear el volumen `pgdata`, Postgres ejecuta `01-schema.sql` y deja la base con todas las tablas. En el primer arranque el backend crea el administrador de `DEFAULT_ADMIN_*`: cambia su contraseña tras entrar.

Comprobación: `curl http://localhost:3001/api/v1/health` debe responder `"status":"ok"` con la base `connected`.

## Actualizar

```bash
git pull
docker compose --env-file .env.production up -d --build api
```

En producción TypeORM no sincroniza el esquema (`synchronize` solo está activo con `NODE_ENV=development`). Si la versión trae migraciones nuevas en `src/migrations/`, aplicarlas **antes** de levantar la API nueva. Son idempotentes:

```bash
docker compose --env-file .env.production exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < src/migrations/add_database_connections.sql
```

`01-schema.sql` solo se aplica a un volumen vacío: en una base ya existente no hace nada.

## Al cambiar una entidad

Crear su migración `src/migrations/add_*.sql` (para las bases existentes) y regenerar el esquema inicial (para las nuevas):

```bash
./docker/generate-schema.sh   # necesita Docker y pnpm; levanta un Postgres temporal y lo borra
```

## Proxy inverso y TLS

La API debe ir detrás de un proxy con TLS (Caddy, Nginx, Traefik). En ese caso, publicar el puerto solo en local cambiando el mapeo de `api` a `"127.0.0.1:3001:3001"`. El proxy tiene que reenviar WebSocket (Socket.IO de métricas, terminal y SFTP, y el canal del agente) y las cabeceras `X-Forwarded-For`/`X-Real-IP`, que el backend usa para la IP de las sesiones.

- `CORS_ORIGIN`: URL exacta del frontend web; los orígenes de la app de escritorio se añaden solos.
- `PANEL_PUBLIC_URL`: URL por la que los servidores monitorizados alcanzan la API.

## Copias de seguridad

```bash
docker compose --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-$(date +%F).dump
```

Guardar también `.env.production`: sin el mismo `DB_CREDENTIALS_KEY` las contraseñas de las conexiones a bases de datos y las claves de API de los asistentes de IA de la copia no se pueden descifrar. Redis es solo caché y no necesita copia.
