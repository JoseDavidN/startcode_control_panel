# Despliegue del backend en producción

El backend se publica como imagen en Docker Hub (`<DOCKERHUB_USER>/startcode-panel-backend`) y corre con `docker compose`, que la descarga. Por defecto usa una base PostgreSQL y un Redis (solo caché) que ya existen. Si no los hay, el mismo compose puede levantarlos (perfiles `db` y `cache`). La API queda expuesta en el puerto 3001. Todo se ejecuta desde la carpeta `BACKEND/`.

## Archivos

| Archivo | Para qué |
|---|---|
| `Dockerfile` | Imagen multi-etapa: compila con las herramientas nativas que piden `ssh2`/`cpu-features` y deja una imagen final solo con `dist/`, dependencias de producción y `public/`, como usuario `node`, con healthcheck en `/api/v1/health` |
| `docker-compose.yml` | Servicio `api` con la imagen de Docker Hub; `postgres` (perfil `db`) y `redis` (perfil `cache`) opcionales, sin puertos publicados |
| `.env.production.example` | Variables de producción; copiar como `.env.production` |
| `Makefile` | `make image` (imagen local) y `make push` (publicar en Docker Hub) |
| `docker/postgres/initdb/01-schema.sql` | Esquema completo de la base, generado desde las entidades |
| `docker/generate-schema.sh` | Regenera ese esquema |

## Publicar la imagen en Docker Hub

Desde la máquina donde se compila (con Docker y buildx):

```bash
docker login
make push DOCKERHUB_USER=miusuario     # amd64 y arm64: <usuario>/startcode-panel-backend:<versión> y :latest
```

La versión sale de `package.json` y se publica como `X.Y.Z`, `X.Y` y `latest`. Para probar antes sin publicar: `make image DOCKERHUB_USER=miusuario` (solo la arquitectura de esa máquina). Preparación de buildx, versionado y cómo publicar cada cambio: `docs/IMAGENES_DOCKER.md`.

## Primera instalación

```bash
cp .env.production.example .env.production
# Completar: DOCKERHUB_USER, BACKEND_TAG, contraseñas, JWT_SECRET, DB_CREDENTIALS_KEY,
# CORS_ORIGIN, PANEL_PUBLIC_URL y el administrador inicial
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 32   # DB_CREDENTIALS_KEY (no cambiarla nunca después)
```

`DB_CREDENTIALS_KEY` cifra (AES-256-GCM) las llaves privadas SSH de los servidores, las contraseñas de las conexiones a bases de datos y las claves de API del asistente: en la base solo queda el valor cifrado, y el backend lo descifra en memoria al conectar. Sin esta clave no se pueden crear servidores. Al actualizar desde una versión anterior a la 0.10.0, el backend cifra al arrancar las llaves SSH que estaban en claro (lo indica en el registro).

Los artefactos del agente (instalador y binarios) van en `./agent-dist`, publicados por el repositorio del agente.

### Con una base de datos y un Redis existentes (por defecto)

En `.env.production`, `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD` y `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` de los existentes:

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
docker compose --env-file .env.production logs -f api
```

En producción TypeORM no crea ni cambia tablas (`synchronize` solo está activo con `NODE_ENV=development`): la base tiene que tener ya el esquema al día. En una base vacía se aplica `docker/postgres/initdb/01-schema.sql` con `psql`.

> Si la misma base la usa también un backend en desarrollo (`NODE_ENV=development`), ese backend sincroniza el esquema con sus entidades al arrancar: un cambio de entidad a medias en desarrollo cambia también las tablas de producción.

### Con base de datos y Redis del propio compose

Dejar vacíos `DB_HOST` y `REDIS_HOST` (apuntan a los servicios `postgres` y `redis`), crear el volumen de la base (una sola vez) y activar los perfiles:

```bash
docker volume create startcode-pgdata      # o enlazado a /srv, ver abajo
docker compose --env-file .env.production --profile db --profile cache pull
docker compose --env-file .env.production --profile db --profile cache up -d
```

Se puede activar solo uno (p. ej. solo `--profile cache` con la base existente). La primera vez que Postgres arranca con el volumen vacío ejecuta `01-schema.sql` y deja la base con todas las tablas. Con el perfil `cache`, `REDIS_PASSWORD` es obligatoria.

Los datos de la base van en un volumen externo de Docker (`DB_VOLUME`, por defecto `startcode-pgdata`): el compose no lo crea ni lo borra, ni con `down -v`. Sin el perfil `db` no hace falta. Redis es solo caché y no guarda nada en disco.

#### Base de datos en una carpeta del host (p. ej. `/srv`)

Para que los datos de Postgres queden en `/srv` en lugar de en `/var/lib/docker/volumes`, se crea el volumen enlazado a esa carpeta (una sola vez, antes del primer `up`). El compose no cambia: monta el volumen por su nombre.

```bash
# 1. Carpeta vacía (la imagen de Postgres le pone su propio dueño al arrancar)
sudo mkdir -p /srv/startcode-panel/pgdata

# 2. Volumen que apunta a esa carpeta
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/srv/startcode-panel/pgdata \
  startcode-pgdata

# 3. Comprobar: "device" debe ser la carpeta de /srv
docker volume inspect startcode-pgdata
```

En `.env.production`, `DB_VOLUME=startcode-pgdata` (el de por defecto). Luego `pull` y `up -d` con `--profile db` como arriba.

| Carpeta del host | En el contenedor | Contenido |
|---|---|---|
| `/srv/startcode-panel/pgdata` | `/var/lib/postgresql/data` | Archivos de la base PostgreSQL |

- La carpeta tiene que estar vacía la primera vez: si no, Postgres no inicializa la base ni aplica `01-schema.sql`.
- Si va en otro disco, montarlo en `/srv/startcode-panel/pgdata` antes de crear el volumen.
- Docker no cambia la carpeta de un volumen ya creado. Para mover una base existente: hacer una copia (ver «Copias de seguridad»), `docker compose --profile db down`, copiar el contenido del volumen (ruta en `docker volume inspect <nombre>` → `Mountpoint`) con `sudo cp -a` a la carpeta de `/srv`, `docker volume rm <nombre>`, crearlo con el comando del paso 2 y volver a levantar.
- No copiar los archivos de la base con Postgres en marcha: para copias en caliente, `pg_dump`.

En el primer arranque el backend crea el administrador de `DEFAULT_ADMIN_*`: cambia su contraseña tras entrar.

Comprobación: `curl http://localhost:3001/api/v1/health` debe responder `"status":"ok"`, `"environment":"production"` y la base `connected`.

## Actualizar

Publicar la versión nueva (`make push`), subir `BACKEND_TAG` en `.env.production` (o usar `latest`) y:

```bash
docker compose --env-file .env.production pull api
docker compose --env-file .env.production up -d api
```

(con los perfiles `--profile db --profile cache` si se usan).

Si la versión trae migraciones nuevas en `src/migrations/`, aplicarlas **antes** de levantar la API nueva. Son idempotentes. Con la base existente:

```bash
psql "postgresql://$DB_USERNAME@$DB_HOST:$DB_PORT/$DB_NAME" -v ON_ERROR_STOP=1 -f src/migrations/add_database_connections.sql
```

Con la base del compose:

```bash
docker compose --env-file .env.production --profile db exec -T postgres \
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

Base existente: con su propio `pg_dump`. Base del compose:

```bash
docker compose --env-file .env.production --profile db exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-$(date +%F).dump
```

Guardar también `.env.production`: sin el mismo `DB_CREDENTIALS_KEY` las llaves SSH de los servidores, las contraseñas de las conexiones a bases de datos y las claves de API de los asistentes de IA de la copia no se pueden descifrar. Redis es solo caché y no necesita copia.
