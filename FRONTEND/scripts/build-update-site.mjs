#!/usr/bin/env node
/**
 * Arma la carpeta que se sube tal cual a releases.startcode.com.co a partir
 * de los artefactos que deja el workflow `desktop-build`.
 *
 *   node scripts/build-update-site.mjs <artefactos> <salida>
 *
 * Resultado (`<salida>/startcode-panel/`):
 *   versions.json                       novedades que muestra la app
 *   files/<versión>/<instalables>       .deb .rpm .AppImage .msi .exe .dmg y paquetes de actualización + .sig
 *   <target>/<arch>/latest.json         lo que consulta el actualizador de Tauri
 *
 * El actualizador pide `<target>/<arch>/<versión actual>`: el servidor web
 * reescribe esa ruta a `<target>/<arch>/latest.json` (ver docs/RELEASES.md).
 * Tauri compara la versión del JSON con la instalada, así que un único
 * archivo por plataforma sirve para cualquier versión de origen.
 *
 * Variables: RELEASES_BASE_URL (por defecto https://releases.startcode.com.co/startcode-panel).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [artifactsDir, outDir] = process.argv.slice(2);
if (!artifactsDir || !outDir) {
  console.error('Uso: node scripts/build-update-site.mjs <artefactos> <salida>');
  process.exit(1);
}

const BASE_URL = (process.env.RELEASES_BASE_URL || 'https://releases.startcode.com.co/startcode-panel').replace(/\/$/, '');

const tauriConf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = tauriConf.version;
const catalog = JSON.parse(readFileSync(join(root, 'src/release/versions.json'), 'utf8'));
const entry = catalog.versions.find(v => v.version === version);

const fail = msg => { console.error(`✖ ${msg}`); process.exit(1); };
if (!entry) fail(`src/release/versions.json no tiene la entrada de la versión ${version}.`);

/* ── Notas para el actualizador ───────────────────────────────────── */
const SECTION_LABEL = {
  added: 'Novedades', changed: 'Cambios', fixed: 'Correcciones', removed: 'Eliminado', security: 'Seguridad',
};
const notes = [
  entry.title,
  ...Object.entries(SECTION_LABEL)
    .filter(([key]) => entry.changes?.[key]?.length)
    .map(([key, label]) => `${label}:\n${entry.changes[key].map(c => `• ${c}`).join('\n')}`),
].filter(Boolean).join('\n\n');

/* ── Artefactos ───────────────────────────────────────────────────── */
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

/* El nombre de cada artefacto dice la plataforma (ver matrix.artifact en el
   workflow): startcode-panel-<target>-<arch>. `archs`: carpetas del
   actualizador que sirve. El de macOS es universal (Intel y Apple Silicon en
   el mismo .app): el actualizador pide darwin/<arch real del Mac>, así que el
   mismo paquete se publica en las dos. */
const PLATFORM_BY_ARTIFACT = {
  'startcode-panel-linux-x86_64': { target: 'linux', arch: 'x86_64', archs: ['x86_64'], updater: /\.AppImage$/ },
  'startcode-panel-windows-x86_64': { target: 'windows', arch: 'x86_64', archs: ['x86_64'], updater: /-setup\.exe$/ },
  'startcode-panel-darwin-universal': { target: 'darwin', arch: 'universal', archs: ['aarch64', 'x86_64'], updater: /\.app\.tar\.gz$/ },
};

const site = join(outDir, 'startcode-panel');
rmSync(site, { recursive: true, force: true });
const filesDir = join(site, 'files', version);
mkdirSync(filesDir, { recursive: true });

/* Sin espacios en las URLs, y el .app.tar.gz de macOS no lleva versión ni
   arquitectura en el nombre: se le añaden. */
const publishedName = (file, platform) => {
  let name = basename(file).replace(/\s+/g, '_');
  if (/\.app\.tar\.gz(\.sig)?$/.test(name)) {
    name = name.replace(/\.app\.tar\.gz/, `_${version}_${platform.arch}.app.tar.gz`);
  }
  return name;
};

const pubDate = new Date().toISOString();
const found = [];

for (const artifact of readdirSync(artifactsDir)) {
  const platform = PLATFORM_BY_ARTIFACT[artifact];
  if (!platform) continue;

  const files = walk(join(artifactsDir, artifact));
  for (const file of files) copyFileSync(file, join(filesDir, publishedName(file, platform)));

  const bundle = files.find(f => platform.updater.test(f));
  const signature = bundle && files.find(f => f === `${bundle}.sig`);
  if (!bundle || !signature) {
    fail(`${artifact}: falta el paquete de actualización o su .sig (¿TAURI_SIGNING_PRIVATE_KEY configurada?).`);
  }

  const manifest = {
    version,
    notes,
    pub_date: pubDate,
    url: `${BASE_URL}/files/${version}/${encodeURIComponent(publishedName(bundle, platform))}`,
    signature: readFileSync(signature, 'utf8').trim(),
  };
  for (const arch of platform.archs) {
    const dir = join(site, platform.target, arch);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    found.push(`${platform.target}/${arch}`);
  }
}

if (!found.length) fail(`No se encontró ningún artefacto en ${artifactsDir}.`);

writeFileSync(join(site, 'versions.json'), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`✔ startcode-panel ${version} (${entry.type}) para: ${found.join(', ')}`);
console.log(`  Subir ${site} a ${BASE_URL.replace(/\/startcode-panel$/, '')}/`);
