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
docker compose exec cloud node dist/cli/user-add <usuario>
```
Reinicia la nube después para que lea el cambio.

## Producción (docker compose)
```bash
cp .env.example .env.production
openssl rand -base64 48            # → CLOUD_JWT_SECRET
# CLOUD_ADMIN_PASSWORD, CORS_ORIGIN (URL del panel web)
CLOUD_STORAGE_DIR=/mnt/almacenamiento docker compose up -d --build
```
- `CLOUD_STORAGE_DIR` es la carpeta del host que se monta en `/storage`; Home y Backups solo pueden configurarse dentro de ella (`CLOUD_ALLOWED_ROOTS`). Debe pertenecer al uid 1000.
- El estado (`users.json`, `sessions.json`) vive en el volumen `cloud-data`.
- Pon la nube detrás de HTTPS si sale de la red local: el token viaja en cada petición.

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
| GET | `/files/content?section&path` | Descarga de un archivo |
| GET | `/files/zip?section&path` | Carpeta comprimida en .zip |
| PATCH | `/entries/rename` | `{ section, path, name }` |
| POST | `/entries/move` | `{ section, path, toSection, toParent? }` (entre secciones también) |
| DELETE | `/entries?section&path` | Elimina (carpetas con su contenido) |

Las rutas son relativas a la raíz de la sección (`Documentos/Contratos`). Se rechazan rutas absolutas, `.`/`..`, nombres con `/ \ : * ? " < > |` y cualquier camino que atraviese un enlace simbólico. Los errores llevan `{ code, message, hint? }` en español.
