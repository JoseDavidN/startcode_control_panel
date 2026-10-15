# StartCode Cloud

Backend de la vista **Cloud** de StartCode Panel. Guarda los archivos de **Home** y **Backups** tal cual en el disco del servidor; carpetas, fechas y tamaños se leen del sistema de archivos (sin base de datos). NestJS + TypeScript, independiente de `BACKEND/`: el panel habla directo con él.

## Cómo se conecta el panel
1. En el panel: **Cloud → engranaje → Conexión**. Se escribe la URL (`http://servidor:3100`), usuario y contraseña de la nube.
2. El panel comprueba `/api/v1/health` y hace `POST /auth/login`; la nube devuelve un token de sesión (por defecto 180 días) que el panel guarda en el equipo.
3. **Desconectar** cierra esa sesión en la nube (`POST /auth/logout`): el token deja de valer aunque no haya expirado.

## Desarrollo
```bash
cp .env.example .env      # completa CLOUD_JWT_SECRET y CLOUD_ADMIN_PASSWORD
pnpm install
pnpm start:dev            # http://localhost:3100/api/v1
pnpm test
```

## Usuarios
El primero se crea al arrancar con `CLOUD_ADMIN_USERNAME` / `CLOUD_ADMIN_PASSWORD` si no hay ninguno. Para crear otro o cambiar una contraseña:
```bash
pnpm user:add <usuario>            # compilado (producción)
pnpm user:add:dev <usuario>        # desde src
docker compose --env-file .env.production exec cloud node dist/cli/user-add <usuario>
```
Reinicia la nube después para que lea el cambio.

## Producción (docker compose, imagen de Docker Hub)
La imagen se publica como `<DOCKERHUB_USER>/startcode-cloud` (`make push`; ver `docs/IMAGENES_DOCKER.md`) y el compose la descarga:
```bash
cp .env.production.example .env.production
openssl rand -base64 48            # → CLOUD_JWT_SECRET
# DOCKERHUB_USER, CLOUD_TAG, CLOUD_ADMIN_PASSWORD, CORS_ORIGIN (URL del panel web)
docker volume create startcode-cloud-data       # solo la primera vez
docker volume create startcode-cloud-storage
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
```
Para actualizar: `CLOUD_TAG` a la versión nueva, `pull` y `up -d`.
- Los dos montajes son volúmenes externos de Docker (nombres en `CLOUD_DATA_VOLUME` y `CLOUD_STORAGE_VOLUME`): el compose no los crea ni los borra, ni con `down -v`. Si ya existen de un despliegue anterior, basta con poner sus nombres.
- `/storage` (volumen de almacenamiento) guarda Home y Backups; solo pueden configurarse dentro de él (`CLOUD_ALLOWED_ROOTS`). `/data` guarda el estado (`users.json`, `sessions.json`) y la caché de videos.
- Un volumen nuevo y vacío toma el dueño de la imagen (uid 1000, `node`) al montarse la primera vez.
- Pon la nube detrás de HTTPS si sale de la red local: el token viaja en cada petición.

### Volúmenes en una carpeta del host (p. ej. `/srv`)
Para que los datos queden en `/srv` en lugar de en `/var/lib/docker/volumes`, se crean los volúmenes enlazados a esas carpetas (una sola vez, antes del primer `up`). El compose no cambia: monta los volúmenes por su nombre.
```bash
# 1. Carpetas, del uid 1000 (node, el usuario de la imagen)
sudo mkdir -p /srv/startcode-cloud/data /srv/startcode-cloud/storage
sudo chown -R 1000:1000 /srv/startcode-cloud

# 2. Volúmenes que apuntan a esas carpetas
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/srv/startcode-cloud/data \
  startcode-cloud-data
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/srv/startcode-cloud/storage \
  startcode-cloud-storage

# 3. Comprobar: "device" debe ser la carpeta de /srv
docker volume inspect startcode-cloud-storage
```
En `.env.production`, `CLOUD_DATA_VOLUME` y `CLOUD_STORAGE_VOLUME` con esos nombres (son los de por defecto). Luego `pull` y `up -d` como arriba.

| Carpeta del host | En el contenedor | Contenido |
|---|---|---|
| `/srv/startcode-cloud/data` | `/data` | Usuarios, sesiones y caché de videos convertidos |
| `/srv/startcode-cloud/storage` | `/storage` | Archivos de Home y Backups (en la app se ven como `/storage/...`) |

- Si el almacenamiento está en otro disco, móntalo en `/srv/startcode-cloud/storage` antes de crear el volumen.
- Docker no cambia la carpeta de un volumen ya creado. Para mover uno existente: `docker compose down`, copiar su contenido (ruta en `docker volume inspect <nombre>` → `Mountpoint`) a la carpeta de `/srv`, `docker volume rm <nombre>`, crearlo con el comando del paso 2 y volver a levantar.
- Si la nube da errores de permisos al subir archivos, repetir `sudo chown -R 1000:1000 /srv/startcode-cloud`.

## Video

Cualquier formato se reproduce en el panel. La imagen Docker trae ffmpeg; fuera de Docker hay que instalarlo (`apt install ffmpeg`). ffprobe analiza cada video y se elige lo más barato:

- **Directo** (MP4/MOV con H.264 y AAC/MP3, WebM, HEVC/AV1/VP9 si el webview los admite): se sirve el archivo a tramos, sin ffmpeg.
- **Re-empaquetar** (MKV, AVI, TS… con un códec compatible): ffmpeg copia el video (`-c copy`) a MP4 y, si hace falta, pasa el audio a AAC. Casi no usa CPU.
- **Convertir** (Xvid/MPEG-4, WMV, MPEG-2, H.264 de 10 bits, HEVC sin soporte…): H.264 con `superfast` y `zerolatency`, hasta 720p, con hilos limitados y prioridad baja. Como mucho `CLOUD_MAX_TRANSCODES` a la vez.

ffmpeg genera al ritmo que lee el reproductor y se corta al cerrar el video o saltar. Una conversión vista entera se guarda en `CLOUD_MEDIA_CACHE_DIR` (hasta `CLOUD_MEDIA_CACHE_BYTES`, se borra lo menos visto) y la siguiente vez se sirve directa. Variables en `.env.example`.

## API (`/api/v1`)
| Método | Ruta | Uso |
|---|---|---|
| GET | `/health` | Público: `{ service: 'startcode-cloud', version }` |
| POST | `/auth/login` | `{ username, password, deviceName? }` → `{ token, username, expiresAt }` (5/min) |
| POST | `/auth/logout` | Revoca la sesión actual |
| GET | `/auth/me` | Usuario y versión |
| GET / PUT | `/config/paths` | Rutas de Home y Backups (dentro de `CLOUD_ALLOWED_ROOTS`) |
| GET | `/tree/:section` | Árbol completo de `home` o `backups` (tope `CLOUD_TREE_MAX_ENTRIES`) |
| GET | `/storage` | `{ used, total }` del disco |
| POST | `/folders` | `{ section, parent?, name }` |
| PUT | `/files?section&parent&relPath&size` | Subida en streaming (cuerpo crudo); reemplaza si existe |
| GET | `/stats` | Resumen para el dashboard: archivos y bytes por sección y por tipo, actividad de 30 días (por fecha de modificación), los 5 más grandes y `truncated`. Se reutiliza 60 s |
| GET | `/files/content?section&path` | Descarga de un archivo |
| POST | `/files/stream-ticket` | `{ section, path, client? }` → ticket de 6 h y `{ url, mode, cached, duration, ffmpeg, size, expiresAt }`. `client`: lo que el webview reproduce (`hevc`, `vp9`, `av1`, `webm`) |
| GET | `/files/stream?ticket` | Reproducción a tramos (`Range` → 206): archivos compatibles y videos ya convertidos en caché. Sin `Authorization`: autoriza el ticket |
| GET | `/files/play?ticket&start` | MP4 fragmentado que ffmpeg genera mientras se ve, desde `start` segundos (`remux`/`transcode`). 503 `TRANSCODE_BUSY` si ya hay `CLOUD_MAX_TRANSCODES` conversiones |
| GET | `/files/seek-point?ticket&t` | `{ start }`: segundo real desde el que empezará `play` al saltar a `t` (fotograma clave al re-empaquetar) |
| GET | `/files/zip?section&path` | Carpeta comprimida en .zip |
| PATCH | `/entries/rename` | `{ section, path, name }` |
| POST | `/entries/move` | `{ section, path, toSection, toParent? }` (entre secciones también) |
| DELETE | `/entries?section&path` | Elimina (carpetas con su contenido) |

Las rutas son relativas a la raíz de la sección (`Documentos/Contratos`). Se rechazan rutas absolutas, `.`/`..`, nombres con `/ \ : * ? " < > |` y cualquier camino que atraviese un enlace simbólico. Los errores llevan `{ code, message, hint? }` en español.
