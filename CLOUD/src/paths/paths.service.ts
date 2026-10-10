import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, realpath } from 'fs/promises';
import { isAbsolute, normalize, sep } from 'path';
import { CloudConfig } from '@/common/cloud-config';
import { cloudError, translateFsError } from '@/common/errors';
import { SECTIONS, type Section, type SectionPaths } from '@/common/sections';
import { StateStore } from '@/state/state.store';

const LABEL: Record<Section, string> = { home: 'Home', backups: 'Backups' };

/** Ruta normalizada como la escribe el panel: sin barras dobles ni final. */
export const normalizePath = (p: string) => p.trim().replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/**
 * Rutas de Home y Backups de cada usuario. Las elige el panel, pero solo
 * dentro de `CLOUD_ALLOWED_ROOTS`: el panel nunca puede apuntar la nube a
 * una carpeta cualquiera del servidor.
 */
@Injectable()
export class PathsService {
  constructor(
    private readonly config: CloudConfig,
    private readonly state: StateStore,
  ) {}

  get(username: string): SectionPaths {
    return this.state.findUser(username)?.paths ?? this.config.defaultPaths;
  }

  get allowedRoots(): string[] {
    return this.config.allowedRoots;
  }

  /** Errores por sección, con las mismas reglas que el panel más las carpetas permitidas. */
  validate(paths: SectionPaths): Partial<Record<Section, string>> {
    const errors: Partial<Record<Section, string>> = {};
    const clean = { home: normalizePath(paths.home), backups: normalizePath(paths.backups) };
    for (const section of SECTIONS) {
      const p = clean[section];
      if (!p) errors[section] = 'Escribe una ruta.';
      else if (!isAbsolute(p)) errors[section] = 'Debe ser una ruta absoluta (empieza por /).';
      else if (p === '/') errors[section] = 'No puede ser la raíz del sistema.';
      else if (p.split('/').some(seg => seg === '..' || seg === '.')) errors[section] = 'No puede llevar . ni ..';
      else if (/[\0\\:*?"<>|]/.test(p)) errors[section] = 'Tiene caracteres no permitidos.';
      else if (!this.config.allowedRoots.some(root => inside(normalize(p), root))) {
        errors[section] = `Debe estar dentro de ${this.config.allowedRoots.join(' o ')}.`;
      }
    }
    if (!errors.home && !errors.backups) {
      if (clean.home === clean.backups) errors.backups = 'Home y Backups no pueden usar la misma carpeta.';
      else if (inside(clean.backups, clean.home)) errors.backups = 'Backups no puede estar dentro de Home.';
      else if (inside(clean.home, clean.backups)) errors.home = 'Home no puede estar dentro de Backups.';
    }
    return errors;
  }

  async set(username: string, paths: SectionPaths): Promise<SectionPaths> {
    const clean = { home: normalizePath(paths.home), backups: normalizePath(paths.backups) };
    const errors = this.validate(clean);
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PATHS',
        message: Object.entries(errors).map(([s, e]) => `${LABEL[s as Section]}: ${e}`).join(' '),
        errors,
      });
    }
    /* Se crean y se vuelven a comprobar ya resueltas: un enlace simbólico en
       el camino no puede sacarlas de las carpetas permitidas. */
    for (const section of SECTIONS) {
      try {
        await mkdir(clean[section], { recursive: true });
        const real = await realpath(clean[section]);
        const roots = await Promise.all(this.config.allowedRoots.map(r => realpath(r).catch(() => r)));
        if (!roots.some(root => inside(real, root))) {
          throw cloudError(BadRequestException, 'PATH_OUTSIDE', `${LABEL[section]}: la carpeta resuelve fuera de las carpetas permitidas.`);
        }
      } catch (error) {
        throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
      }
    }
    await this.state.setUserPaths(username, clean);
    return clean;
  }
}
