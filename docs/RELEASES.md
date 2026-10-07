# Publicar versiones de StartCode Panel (escritorio)

Las versiones se compilan en GitHub Actions (`.github/workflows/desktop-build.yml`) y se publican en `https://releases.startcode.com.co/startcode-panel/`. La app consulta ese sitio para actualizarse y para mostrar las novedades en **Configuración → Sistema**.

## Configuración única

1. **Claves del actualizador.** Ya generadas en `~/.tauri/startcode.key` (privada) y `.pub` (pública). La pública está en `FRONTEND/src-tauri/tauri.conf.json → plugins.updater.pubkey`.
   > La privada no se sube al repositorio. Si se pierde, las apps instaladas no aceptarán actualizaciones nuevas y habrá que reinstalar a mano.
2. **GitHub → Settings → Secrets and variables → Actions:**
   - Secret `TAURI_SIGNING_PRIVATE_KEY`: contenido de `~/.tauri/startcode.key`.
   - Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: la contraseña con que se generó (vacío si no tiene).
   - Secret `VITE_API_URL`: URL del backend de producción (p. ej. `https://panel.startcode.com.co/api/v1`). Es un secreto y no una variable para que no aparezca en el repositorio ni en los logs.
   - Variable `VITE_RELEASES_URL` (opcional): por defecto `https://releases.startcode.com.co`.
   - Variable `RELEASES_BASE_URL` (opcional): por defecto `https://releases.startcode.com.co/startcode-panel`.
3. **`FRONTEND/.env.production` no se versiona.** El workflow lo crea en cada compilación con el secreto `VITE_API_URL` y la variable `VITE_RELEASES_URL`. En local cada uno tiene el suyo (ver `FRONTEND/.env.example`). Ojo: la URL queda dentro de la app compilada, así que quien tenga el instalable puede verla; el secreto evita exponerla en el repositorio, no en el binario.
4. **Servidor web del sitio de releases.** El actualizador pide
   `/startcode-panel/{target}/{arch}/{versión instalada}`; esa ruta se reescribe al `latest.json` de la plataforma, y Tauri compara versiones por su cuenta. `versions.json` necesita CORS porque lo lee la app.

   Nginx:
   ```nginx
   location ~ ^/startcode-panel/(linux|windows|darwin)/(x86_64|aarch64)/[^/]+$ {
       default_type application/json;
       add_header Cache-Control "no-cache";
       try_files /startcode-panel/$1/$2/latest.json =404;
   }
   location = /startcode-panel/versions.json {
       add_header Access-Control-Allow-Origin "*";
       add_header Cache-Control "no-cache";
   }
   location /startcode-panel/files/ {
       add_header Cache-Control "public, max-age=31536000, immutable";
   }
   ```
   Apache (`.htaccess` en la raíz):
   ```apache
   RewriteEngine On
   RewriteRule ^startcode-panel/(linux|windows|darwin)/(x86_64|aarch64)/[^/]+$ startcode-panel/$1/$2/latest.json [L]
   <Files "versions.json">
     Header set Access-Control-Allow-Origin "*"
   </Files>
   ```

## Cada versión

1. **Elegir el tipo de salto** (semver): `patch` (0.1.0 → 0.1.1) correcciones; `minor` (0.1.x → 0.2.0) funciones nuevas compatibles; `major` (0.x → 1.0.0) cambios que rompen algo.
2. **Subir la versión** en `FRONTEND/src-tauri/tauri.conf.json` y `FRONTEND/src-tauri/Cargo.toml` (deben coincidir).
3. **Escribir las novedades** en `FRONTEND/src/release/versions.json`, al principio de `versions`:
   ```json
   {
     "version": "0.2.0",
     "type": "minor",
     "date": "2026-10-20",
     "title": "Línea de comandos y Docker",
     "changes": {
       "added": ["…"],
       "changed": ["…"],
       "fixed": ["…"],
       "removed": ["…"],
       "security": ["…"]
     }
   }
   ```
   Todas las secciones de `changes` son opcionales, pero debe haber al menos un cambio. Este texto es lo que ve el usuario en el aviso de actualización y en *Novedades*.
4. **Comprobar en local:** `cd FRONTEND && node scripts/check-release.mjs v0.2.0`. Valida que versiones y tag coincidan y que `type` corresponda al salto respecto a la versión anterior.
5. **Commit, tag y push:**
   ```bash
   git commit -am "release: v0.2.0"
   git tag v0.2.0
   git push origin dev v0.2.0
   ```
6. **Descargar** de la ejecución del workflow el artefacto `release-site-0.2.0` y **subir su carpeta `startcode-panel/`** a la raíz de `releases.startcode.com.co`, fusionando con lo existente (las versiones anteriores en `files/` se conservan).
   Orden recomendado: primero `files/`, luego `versions.json`, y al final los `latest.json`. Así ninguna app ve la versión antes de que sus archivos existan.

## Comprobar que la actualización funciona

1. Instalar la versión anterior (del artefacto de su ejecución o de `files/<versión>/`).
2. Publicar la nueva siguiendo los pasos de arriba.
3. Comprobar el endpoint: `curl https://releases.startcode.com.co/startcode-panel/linux/x86_64/0.1.0` debe devolver el `latest.json` con la versión nueva.
4. Abrir la app → *Configuración → Sistema → Comprobar*: aparece la versión nueva con sus notas; *Instalar actualización* descarga, verifica la firma y reinicia.
5. En *Novedades*, la versión nueva aparece como **Disponible** antes de instalar y como **Instalada** después.

## Estructura del sitio

```
startcode-panel/
├── versions.json                  novedades (la app lo lee)
├── linux/x86_64/latest.json       AppImage
├── windows/x86_64/latest.json     instalador NSIS (-setup.exe)
├── darwin/aarch64/latest.json     .app.tar.gz Apple Silicon
├── darwin/x86_64/latest.json      .app.tar.gz Intel
└── files/<versión>/               instalables (.deb .rpm .AppImage .msi .exe .dmg) y paquetes de actualización + .sig
```

Los `.deb` y `.rpm` no se actualizan solos (Tauri solo actualiza el AppImage en Linux): quien instale con ellos debe descargar el nuevo paquete.
