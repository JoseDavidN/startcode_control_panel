# Imágenes Docker: compilar, publicar y versionar

Guía para compilar las imágenes de los backends de StartCode Panel, publicarlas en Docker Hub con un versionado ordenado y desplegarlas. Hay dos imágenes y las dos funcionan igual: mismos comandos (`make image`, `make push`), mismas etiquetas y mismo flujo de versiones. Cada una tiene su propia versión y se publica por separado.

| Imagen | Carpeta | Versión (fuente) | Puerto | Despliegue |
|---|---|---|---|---|
| `<DOCKERHUB_USER>/startcode-panel-backend` | `BACKEND/` | `BACKEND/package.json` | 3001 | `BACKEND/docker-compose.yml`, `BACKEND_TAG`; ver `BACKEND/DEPLOY.md` |
| `<DOCKERHUB_USER>/startcode-cloud` | `CLOUD/` | `CLOUD/package.json` | 3100 | `CLOUD/docker-compose.yml`, `CLOUD_TAG`; ver `CLOUD/README.md` |

Los ejemplos de esta guía usan el backend. Para Cloud es lo mismo desde `CLOUD/`, con su versión, `CLOUD_TAG` en lugar de `BACKEND_TAG` y etiquetas de git `cloud-vX.Y.Z`. La primera publicación de Cloud es la **0.2.1** (`make push` desde `CLOUD/`, luego `git tag cloud-v0.2.1`).

Las versiones del backend y de Cloud son independientes entre sí y de la app de escritorio. Por ejemplo, la app 0.7.0 salió con el backend 0.9.0; el backend 0.9.1 y Cloud 0.2.1 son los primeros publicados en Docker Hub. Todas se anotan en `CHANGELOG.md`: el backend como `## [X.Y.Z]` y Cloud como `## [Cloud X.Y.Z]`.

---

## 1. Preparación (una sola vez por máquina)

Hace falta Docker con **buildx** (viene con Docker Desktop y con el plugin `docker-buildx` en Linux).

```bash
# Cuenta de Docker Hub: mejor con un token de acceso (Account settings → Personal access tokens)
docker login

# Constructor multiplataforma: la imagen se publica para amd64 y arm64
docker buildx create --name startcode --driver docker-container --use
docker buildx inspect --bootstrap

# Solo en Linux, para compilar arm64 en una máquina amd64 (emulación QEMU).
# Arch Linux (persistente, sobrevive a reinicios):
sudo pacman -S qemu-user-static qemu-user-static-binfmt
sudo systemctl restart systemd-binfmt
# Otras distribuciones, o sin instalar paquetes (se pierde al reiniciar):
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

`ls /proc/sys/fs/binfmt_misc/` debe incluir `qemu-aarch64`, y `docker buildx ls` debe mostrar el constructor con `linux/amd64` y `linux/arm64`.

Si `make push` falla en la parte arm64 con `exec format error`, falta este paso: el sistema no sabe ejecutar binarios arm64. Para publicar solo amd64 mientras tanto: `make push PLATFORMS=linux/amd64`. La parte arm64 corre emulada y tarda bastante más que la amd64, sobre todo al compilar los módulos nativos del backend (`ssh2`, `cpu-features`).

En Docker Hub, crear una vez los repositorios `startcode-panel-backend` y `startcode-cloud` (públicos o privados). Si es privado, el servidor donde se despliega también necesita `docker login`.

---

## 2. Cómo se versiona en Docker Hub

Se sigue [SemVer](https://semver.org/lang/es/): `MAYOR.MENOR.PARCHE`.

| Cambio | Ejemplo | Cuándo |
|---|---|---|
| **Parche** | 0.9.1 → **0.9.2** | Correcciones, ajustes de despliegue, nada que cambie la API |
| **Menor** | 0.9.2 → **0.10.0** | Funciones nuevas, endpoints nuevos, migraciones de base de datos compatibles |
| **Mayor** | 0.10.0 → **1.0.0** | Cambios que rompen la API o exigen pasos manuales para actualizar |

Cada publicación (`make push`) sube la misma imagen con **tres etiquetas**:

| Etiqueta | Ejemplo | Qué es |
|---|---|---|
| `X.Y.Z` | `0.9.1` | La versión exacta. **Inmutable**: nunca se vuelve a subir. Es la que se usa en producción |
| `X.Y` | `0.9` | El último parche de esa versión menor. Avanza con cada parche (0.9.1 → 0.9.2 → 0.9.3) |
| `latest` | `latest` | La última publicada. Cómoda para pruebas; en producción, mejor una versión exacta |

`make push` **se niega** a publicar una `X.Y.Z` que ya existe en Docker Hub. Si hay que cambiar algo de una versión ya publicada, se publica la siguiente. Así cada número de versión es siempre la misma imagen, y volver atrás es fiable.

Cómo queda Docker Hub con el ejemplo de esta guía:

| Publicación | Etiquetas que quedan |
|---|---|
| 0.9.1 | `0.9.1` · `0.9` → 0.9.1 · `latest` → 0.9.1 |
| 0.9.2 | `0.9.1` · `0.9.2` · `0.9` → 0.9.2 · `latest` → 0.9.2 |
| 0.10.0 | `0.9.1` · `0.9.2` · `0.9` → 0.9.2 · `0.10.0` · `0.10` → 0.10.0 · `latest` → 0.10.0 |

Todas las versiones anteriores siguen disponibles para volver a ellas.

En git, cada versión del backend se marca con una etiqueta propia, `backend-vX.Y.Z`, y cada una de Cloud con `cloud-vX.Y.Z`. Las etiquetas `vX.Y.Z` son de la app de escritorio.

---

## 3. Publicar la primera versión: 0.9.1

`BACKEND/package.json` ya dice `0.9.1` y el `CHANGELOG.md` tiene su sección.

```bash
cd BACKEND

# (opcional) probar la imagen en local, solo para la arquitectura de esta máquina
make image DOCKERHUB_USER=miusuario

# publicar 0.9.1, 0.9 y latest para amd64 y arm64
make push DOCKERHUB_USER=miusuario

# marcar la versión en git
git tag backend-v0.9.1
git push origin backend-v0.9.1
```

Comprobar lo publicado:

```bash
docker buildx imagetools inspect miusuario/startcode-panel-backend:0.9.1
```

Debe listar `linux/amd64` y `linux/arm64`. En la web de Docker Hub aparecen las etiquetas `0.9.1`, `0.9` y `latest`.

Para no escribir el usuario cada vez: `export DOCKERHUB_USER=miusuario` (el Makefile lo toma del entorno).

### Compilar solo ciertas arquitecturas

Por defecto `make push` publica para `linux/amd64` y `linux/arm64` (variable `PLATFORMS`). Para elegir:

```bash
make push DOCKERHUB_USER=miusuario PLATFORMS=linux/amd64     # solo amd64
make push DOCKERHUB_USER=miusuario PLATFORMS=linux/arm64     # solo arm64
make push DOCKERHUB_USER=miusuario PLATFORMS=linux/amd64,linux/arm64   # las dos (por defecto)
export PLATFORMS=linux/amd64                                 # fija la elección para la sesión
```

Qué arquitectura usa cada servidor (`uname -m` en el servidor):

| `uname -m` | Plataforma | Servidores típicos |
|---|---|---|
| `x86_64` | `linux/amd64` | La mayoría de VPS y servidores Intel/AMD |
| `aarch64` | `linux/arm64` | Raspberry Pi 4/5 de 64 bits, Oracle Ampere, AWS Graviton, Hetzner CAX |

- Solo amd64 es mucho más rápido en una máquina amd64, porque no hay emulación. Basta si todos los servidores donde se despliega son `x86_64`.
- `make image` siempre compila solo la arquitectura de la máquina donde se ejecuta: `PLATFORMS` no le aplica.
- Una versión ya publicada no se puede volver a subir (`make push` lo impide). Si se publicó solo con amd64 y después hace falta arm64, hay que publicar la siguiente versión con las dos arquitecturas. En un servidor arm64, una versión publicada solo para amd64 falla al arrancar (`exec format error`).
- `docker buildx imagetools inspect …:X.Y.Z` muestra para qué arquitecturas está publicada cada versión.

---

## 4. Trabajar un cambio y publicarlo

El flujo es el mismo para cualquier versión. Lo que cambia es qué número se sube.

### Ejemplo: corrección → 0.9.2

1. Hacer y probar el cambio en `BACKEND/src` (desarrollo normal, `pnpm start:dev`).
2. Subir la versión en `BACKEND/package.json`: `"version": "0.9.2"`.
3. Añadir su sección en `CHANGELOG.md`, encima de la anterior y debajo de `[Unreleased]`:
   ```markdown
   ## [0.9.2] — AAAA-MM-DD

   Versión de **parche** sobre 0.9.1.

   ### Corregido
   - …
   ```
4. Si cambió una entidad: su migración en `src/migrations/add_*.sql` y regenerar `docker/postgres/initdb/01-schema.sql` (`./docker/generate-schema.sh`). Ver `BACKEND/DEPLOY.md`.
5. Commit, publicar y etiquetar:
   ```bash
   git commit -am "fix: … (backend 0.9.2)"
   cd BACKEND
   make push            # 0.9.2, mueve 0.9 y latest
   git tag backend-v0.9.2 && git push origin backend-v0.9.2
   ```

### Ejemplo: funciones nuevas → 0.10.0

Igual que el parche, pero con `"version": "0.10.0"` y la sección `## [0.10.0]` como versión **menor** (`### Añadido`, `### Cambiado`…). `make push` crea `0.10.0` y `0.10` y mueve `latest`. La rama `0.9` se queda en su último parche.

### Si una versión ya publicada tiene un fallo

No se vuelve a subir la misma versión: `make push` lo impide. Se corrige y se publica el siguiente parche (0.9.3). Para corregir una rama anterior mientras ya existe una más nueva (por ejemplo, un 0.9.3 cuando ya existe 0.10.0), se publica desde un checkout de esa versión (`git checkout -b fix-0.9 backend-v0.9.2`). `latest` pasa entonces a 0.9.3: conviene publicar después el siguiente 0.10.x para que `latest` vuelva a la rama más nueva, o usar solo versiones exactas en producción.

---

## 5. Desplegar una versión en el servidor

En el servidor, en la carpeta del backend con su `.env.production` (ver `BACKEND/DEPLOY.md`):

```bash
# 1. Elegir la versión
#    .env.production → BACKEND_TAG=0.9.2   (exacta; recomendado)
#    o BACKEND_TAG=0.9 para seguir los parches de 0.9 automáticamente

# 2. Si la versión trae migraciones, aplicarlas ANTES (ver DEPLOY.md)

# 3. Descargar y reiniciar solo la API
docker compose --env-file .env.production pull api
docker compose --env-file .env.production up -d api

# 4. Comprobar
curl -s http://localhost:3001/api/v1/health      # "version":"0.9.2"
```

Con la base y Redis del propio compose se añade `--profile db --profile cache` a los comandos.

### Volver a una versión anterior

```bash
# .env.production → BACKEND_TAG=0.9.1
docker compose --env-file .env.production pull api
docker compose --env-file .env.production up -d api
```

Ojo: si la versión nueva aplicó migraciones, la anterior tiene que poder trabajar con esa base. Las migraciones de este proyecto solo añaden (columnas, tablas), así que en general sí. Si una migración borró o renombró algo, volver atrás exige restaurar la copia previa de la base.

---

## 6. Resumen rápido

| Quiero… | Comando |
|---|---|
| Probar la imagen en local | `make image DOCKERHUB_USER=…` |
| Publicar la versión de `package.json` | `make push DOCKERHUB_USER=…` |
| Publicar solo una arquitectura | `make push DOCKERHUB_USER=… PLATFORMS=linux/amd64` |
| Ver qué hay publicado de una versión | `docker buildx imagetools inspect …/startcode-panel-backend:X.Y.Z` |
| Actualizar el servidor | `BACKEND_TAG=X.Y.Z` en `.env.production` → `pull api` → `up -d api` |
| Volver atrás | `BACKEND_TAG` a la versión anterior → `pull api` → `up -d api` |
