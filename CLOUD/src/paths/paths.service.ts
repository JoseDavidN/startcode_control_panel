import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { mkdir, realpath } from 'fs/promises';
import { isAbsolute, normalize } from 'path';
import { CloudConfig } from '@/common/cloud-config';
import { cloudError, translateFsError } from '@/common/errors';
import { SECTIONS, type Section, type SectionPaths } from '@/common/sections';
import { StateStore } from '@/state/state.store';
import { inside, overlaps, usersBase } from './user-paths';

const LABEL: Record<Section, string> = { home: 'Home', backups: 'Backups' };

/** Ruta normalizada como la escribe el panel: sin barras dobles ni final. */
export const normalizePath = (p: string) => p.trim().replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

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

  /** Rutas del usuario. Nunca las por defecto compartidas: cada uno tiene las suyas (ver `assignMissingPaths`). */
  get(username: string): SectionPaths {
    const paths = this.state.findUser(username)?.paths;
    if (!paths) {
      throw cloudError(ForbiddenException, 'NO_PATHS', 'Tu usuario no tiene carpetas asignadas en la nube.', 'Pide al administrador que revise el registro de la nube.');
    }
    return paths;
  }

  get allowedRoots(): string[] {
    return this.config.allowedRoots;
  }

  /** Errores por sección, con las mismas reglas que el panel más las carpetas permitidas. */
  validate(paths: SectionPaths, username?: string): Partial<Record<Section, string>> {
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
      } else if ([this.config.dataDir, this.config.mediaCacheDir].some(dir => dir && overlaps(normalize(p), dir))) {
        errors[section] = 'No puede usar la carpeta de datos internos de la nube.';
      } else if (username !== undefined && this.reservedFor(normalize(p), username)) {
        errors[section] = 'Esa carpeta está reservada para las carpetas de cada usuario.';
      }
    }
    if (!errors.home && !errors.backups) {
      if (clean.home === clean.backups) errors.backups = 'Home y Backups no pueden usar la misma carpeta.';
      else if (inside(clean.backups, clean.home)) errors.backups = 'Backups no puede estar dentro de Home.';
      else if (inside(clean.home, clean.backups)) errors.home = 'Home no puede estar dentro de Backups.';
    }
    return errors;
  }

  /**
   * `<carpeta permitida>/users` guarda las carpetas por defecto de cada
   * usuario: solo se puede usar lo que cae dentro de la propia.
   */
  private reservedFor(p: string, username: string): boolean {
    return this.config.allowedRoots.some(root => {
      const base = usersBase(root);
      return overlaps(p, base) && !inside(p, `${base}/${username.toLowerCase()}`);
    });
  }

  /** Otro usuario cuya carpeta coincide, contiene o está dentro de alguna de `paths`. */
  private sharedWith(username: string, paths: string[]): boolean {
    const me = username.toLowerCase();
    return this.state.listUsers().some(user => user.username.toLowerCase() !== me && user.paths
      && [user.paths.home, user.paths.backups].some(theirs => paths.some(p => overlaps(p, theirs))));
  }

  async set(username: string, paths: SectionPaths): Promise<SectionPaths> {
    const clean = { home: normalizePath(paths.home), backups: normalizePath(paths.backups) };
    const errors = this.validate(clean, username);
    for (const section of SECTIONS) {
      if (!errors[section] && this.sharedWith(username, [normalize(clean[section])])) {
        errors[section] = 'Esa carpeta es de otro usuario de la nube (o contiene la suya).';
      }
    }
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PATHS',
        message: Object.entries(errors).map(([s, e]) => `${LABEL[s as Section]}: ${e}`).join(' '),
        errors,
      });
    }
    /* Se crean y se vuelven a comprobar ya resueltas: un enlace simbólico en
       el camino no puede sacarlas de las carpetas permitidas. */
    const roots = await Promise.all(this.config.allowedRoots.map(r => realpath(r).catch(() => r)));
    const realOf = (p: string) => realpath(p).catch(() => normalize(p));
    for (const section of SECTIONS) {
      try {
        await mkdir(clean[section], { recursive: true });
        const real = await realpath(clean[section]);
        if (!roots.some(root => inside(real, root))) {
          throw cloudError(BadRequestException, 'PATH_OUTSIDE', `${LABEL[section]}: la carpeta resuelve fuera de las carpetas permitidas.`);
        }
        /* Ya resuelta: un enlace no puede llevarla a la carpeta de otro. */
        const me = username.toLowerCase();
        const others = await Promise.all(this.state.listUsers()
          .filter(u => u.username.toLowerCase() !== me && u.paths)
          .flatMap(u => [u.paths!.home, u.paths!.backups])
          .map(realOf));
        if (others.some(theirs => overlaps(real, theirs)) || this.reservedFor(real, username)) {
          throw cloudError(BadRequestException, 'PATH_TAKEN', `${LABEL[section]}: la carpeta resuelve a la de otro usuario.`);
        }
      } catch (error) {
        throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
      }
    }
    /* Otra petición pudo cambiar las rutas de otro usuario mientras tanto: se
       comprueba de nuevo justo antes de guardar, sin esperas de por medio. */
    if (this.sharedWith(username, [clean.home, clean.backups])) {
      throw cloudError(BadRequestException, 'PATH_TAKEN', 'Esa carpeta es de otro usuario de la nube (o contiene la suya).');
    }
    await this.state.setUserPaths(username, clean);
    return clean;
  }
}
