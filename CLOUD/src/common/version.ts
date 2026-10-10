import { readFileSync } from 'fs';
import { join } from 'path';

/* package.json queda un nivel por encima tanto de src/ (ts-node) como de
   dist/ (compilado): main.js vive en dist/, este archivo en dist/common/. */
function readVersion(): string {
  for (const up of [['..', '..'], ['..']]) {
    try {
      return (JSON.parse(readFileSync(join(__dirname, ...up, 'package.json'), 'utf8')) as { version: string }).version;
    } catch {
      /* se prueba el siguiente nivel */
    }
  }
  return '0.0.0';
}

export const APP_VERSION = readVersion();
