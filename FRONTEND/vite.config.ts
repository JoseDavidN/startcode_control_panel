import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync, watchFile, unwatchFile } from 'fs';

const host = process.env.TAURI_DEV_HOST

/* La versión vive en tauri.conf.json; en el navegador (sin la API de Tauri)
   la app la lee de aquí. */
const tauriConf = path.resolve(__dirname, 'src-tauri/tauri.conf.json');
const readVersion = () => (JSON.parse(readFileSync(tauriConf, 'utf8')) as { version: string }).version;
const appVersion = readVersion();

/* La versión se fija al arrancar, y src-tauri está fuera del vigilante de
   Vite (ignored, abajo). Sin esto, subir la versión no se veía en
   Configuración → Sistema hasta reiniciar `pnpm dev` a mano. Se sondea el
   archivo y, si cambia la versión, el servidor se reinicia solo. */
const restartOnVersionChange = (): Plugin => ({
  name: 'restart-on-app-version-change',
  apply: 'serve',
  configureServer(server) {
    const onChange = () => {
      let next: string;
      try { next = readVersion(); } catch { return; /* a medio escribir */ }
      if (next === appVersion) return;
      server.config.logger.info(`Versión de la app ${appVersion} → ${next}: reiniciando el servidor`, { timestamp: true });
      unwatchFile(tauriConf, onChange);
      void server.restart();
    };
    watchFile(tauriConf, { interval: 1000 }, onChange);
    server.httpServer?.once('close', () => unwatchFile(tauriConf, onChange));
  },
});

export default defineConfig(({ command }) => ({
  clearScreen: false,
	plugins: [react(), tailwindcss(), restartOnVersionChange()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@typings': path.resolve(__dirname, './src/types'),
      '@routes': path.resolve(__dirname, './src/routes'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: host ? { host, protocol: 'ws', port: 5183 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    allowedHosts: ['devstar'],
  },
  /* pdf.js se importa de forma dinámica (solo al abrir un PDF): sin esto Vite
     lo descubre tarde, re-optimiza las dependencias con la app ya abierta y
     el webview se queda con módulos de dos optimizaciones distintas
     (`pdfjs.GlobalWorkerOptions` llegaba undefined). Se pre-empaqueta al arrancar. */
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  envPrefix: ['VITE_', 'TAURI_'],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  /* En producción se quitan los console.log/debug (los errores se quedan):
     algunos volcaban payloads enteros del socket y el inspector los retenía. */
  esbuild: command === 'build' && !process.env.TAURI_ENV_DEBUG
    ? { pure: ['console.log', 'console.debug'] }
    : undefined,
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        /* Librerías en chunks propios: cambian menos que la app, así que
           quedan en caché entre versiones, y recharts/xterm solo se cargan
           con la página que los usa. */
        manualChunks: (id) => {
          /* El helper de CommonJS lo usan React y recharts: si cae en el chunk
             de gráficas, React arrastra recharts a la carga inicial. */
          if (id.includes('commonjsHelpers')) return 'react';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'query';
          if (/socket\.io|engine\.io/.test(id)) return 'socket';
          if (/recharts|d3-|victory-vendor/.test(id)) return 'charts';
          if (id.includes('@xterm')) return 'xterm';
          return undefined;
        },
      },
    },
  },
}));
