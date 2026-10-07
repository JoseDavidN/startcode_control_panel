# Guía: Tauri v2 para el Frontend de StartCode Panel

## 1. Prerrequisitos del sistema (Linux)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

```bash
# Instalar Rust (requerido por Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Verificar
rustc --version
cargo --version
```

## 2. Instalar Tauri CLI

Dentro de `FRONTEND/`:

```bash
cd FRONTEND
pnpm add -D @tauri-apps/cli@^2
pnpm add @tauri-apps/api@^2
```

## 3. Inicializar Tauri

```bash
pnpm tauri init
```

Respuestas cuando pregunta:

| Pregunta | Valor |
|---|---|
| App name | `StartCode Panel` |
| Window title | `StartCode Panel` |
| Where are web assets? | `../dist` |
| Dev server URL | `http://localhost:1420` |
| Frontend dev command | `pnpm dev` |
| Frontend build command | `pnpm build` |

Esto genera la carpeta `FRONTEND/src-tauri/`.

## 4. Modificar `FRONTEND/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

## 5. Configurar `src-tauri/tauri.conf.json`

Reemplazar el contenido generado con:

```json
{
  "productName": "StartCode Panel",
  "version": "1.0.0",
  "identifier": "com.startcode.panel",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "StartCode Panel",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://* https://* ws://* wss://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

> El `csp` es crítico: sin él, las llamadas HTTP y WebSocket al backend remoto quedan bloqueadas por Tauri.

## 6. Agregar scripts en `FRONTEND/package.json`

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

## 7. Configurar variables de entorno para producción

`FRONTEND/.env.production` (no se versiona) es lo que usa `pnpm tauri:build` en local; en CI el workflow lo genera desde el secreto `VITE_API_URL` de GitHub. No poner datos sensibles: queda dentro de la app.

```env
VITE_API_URL=https://tu-servidor.com/api/v1
VITE_RELEASES_URL=https://releases.startcode.com.co
```

Los WebSockets no tienen variable propia: usan el origen de `VITE_API_URL` sin `/api/v1`. Para desarrollo se usa `FRONTEND/.env.development`; la descripción de cada variable está en `FRONTEND/.env.example`.

## 8. Generar iconos

Tauri necesita iconos. Con un PNG de al menos 1024×1024:

```bash
pnpm tauri icon ruta/a/tu-icono.png
```

Si no tienes icono todavía, los placeholders se generan automáticamente en el init.

## 9. Correr en modo desarrollo

```bash
cd FRONTEND
pnpm tauri:dev
```

Esto levanta Vite en el puerto 1420 y abre la ventana nativa.

## 10. Build final

```bash
pnpm tauri:build
```

El instalador queda en `FRONTEND/src-tauri/target/release/bundle/`.

## Notas importantes para este proyecto

- **`constants.ts`** lee `VITE_API_URL` y de ella saca `API_CONFIG.BASE_URL` y `API_CONFIG.WS_URL`; los sockets (`AppProviders` → `RealtimeMetricsContext`, terminal y SFTP) usan `WS_URL`.
- **WebSockets** — el CSP configurado arriba ya permite `ws://` y `wss://`, necesario para Socket.io.
- **CORS en el backend** — asegurarse de que NestJS acepte el origen `tauri://localhost` en producción.
