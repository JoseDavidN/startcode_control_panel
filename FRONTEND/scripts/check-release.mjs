#!/usr/bin/env node
/**
 * Comprueba que una versión se puede publicar, antes de gastar minutos de CI:
 *
 *   node scripts/check-release.mjs [tag]
 *
 * - La versión de tauri.conf.json coincide con Cargo.toml y, si
 *   se pasa, con el tag (`v0.2.0`).
 * - src/release/versions.json tiene su entrada, con `type` válido y coherente
 *   con la versión anterior (major / minor / patch según qué número subió),
 *   y al menos un cambio.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const errors = [];

const version = JSON.parse(read('src-tauri/tauri.conf.json')).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];
const tag = process.argv[2];

if (cargoVersion !== version) errors.push(`Cargo.toml tiene ${cargoVersion} y tauri.conf.json ${version}.`);
if (tag && tag.replace(/^v/, '') !== version) errors.push(`El tag ${tag} no coincide con la versión ${version} de tauri.conf.json.`);

const parse = v => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1).map(Number) : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const { versions = [] } = JSON.parse(read('src/release/versions.json'));
const entry = versions.find(v => v.version === version);
const current = parse(version);

if (!current) errors.push(`La versión ${version} no es semver x.y.z.`);
if (!entry) {
  errors.push(`src/release/versions.json no tiene la entrada de ${version}.`);
} else {
  if (!['major', 'minor', 'patch'].includes(entry.type)) errors.push(`type "${entry.type}" no es major, minor ni patch.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) errors.push('date debe ser AAAA-MM-DD.');
  const total = Object.values(entry.changes ?? {}).flat().length;
  if (!total) errors.push(`La versión ${version} no lista ningún cambio.`);

  /* El tipo tiene que corresponder con el salto respecto a la anterior. */
  const previous = versions
    .map(v => parse(v.version))
    .filter(v => v && current && cmp(v, current) < 0)
    .sort(cmp)
    .pop();
  if (previous && current) {
    const expected = current[0] > previous[0] ? 'major' : current[1] > previous[1] ? 'minor' : 'patch';
    if (entry.type !== expected) {
      errors.push(`De ${previous.join('.')} a ${version} es un salto ${expected}, pero type dice ${entry.type}.`);
    }
  }
}

if (errors.length) {
  errors.forEach(e => console.error(`✖ ${e}`));
  process.exit(1);
}
console.log(`✔ ${version} lista para publicar (${entry.type})`);
