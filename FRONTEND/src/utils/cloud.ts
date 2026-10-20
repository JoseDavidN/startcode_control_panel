import type {
  CloudPaths, CloudSection, CloudDateFilter, CloudEntry, CloudFileType, CloudFilters, CloudGroup, CloudFolder, CloudModifiedFilter, CloudTypeFilter,
} from '@typings/cloud.types';
import type { CloudIconName } from '@components/cloud/icons';

export const CLOUD_FILE_TYPE_LABELS: Record<CloudFileType, string> = {
  word:       'Documento de Word',
  excel:      'Hoja de Excel',
  powerpoint: 'Presentación de PowerPoint',
  pdf:        'Documento PDF',
  image:      'Imagen',
  video:      'Video',
  audio:      'Audio',
  archive:    'Comprimido',
  code:       'Código',
  text:       'Texto',
};

/** Grupos de la vista de lista, en su orden: carpetas primero. */
export const CLOUD_GROUP_LABELS: Record<CloudGroup, string> = {
  folder:     'Carpetas',
  word:       'Archivos Word',
  excel:      'Archivos Excel',
  powerpoint: 'Presentaciones PowerPoint',
  pdf:        'Archivos PDF',
  image:      'Imágenes',
  video:      'Videos',
  audio:      'Audio',
  archive:    'Comprimidos',
  code:       'Código',
  text:       'Texto',
};

const GROUP_ORDER = Object.keys(CLOUD_GROUP_LABELS) as CloudGroup[];

/** Reparte el contenido ya ordenado en grupos no vacíos, en el orden de `CLOUD_GROUP_LABELS`. */
export function groupEntries(entries: CloudEntry[]): [CloudGroup, CloudEntry[]][] {
  const groups = new Map<CloudGroup, CloudEntry[]>();
  for (const e of entries) {
    const key: CloudGroup = e.kind === 'folder' ? 'folder' : e.type;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return GROUP_ORDER.filter(g => groups.has(g)).map(g => [g, groups.get(g)!]);
}

export const CLOUD_TYPE_FILTERS: [CloudTypeFilter, string][] = [
  ['all',        'Todos'],
  ['folder',     'Carpetas'],
  ['word',       'Word'],
  ['excel',      'Excel'],
  ['powerpoint', 'PowerPoint'],
  ['pdf',        'PDF'],
  ['image',      'Imágenes'],
  ['video',      'Videos'],
  ['audio',      'Audio'],
  ['archive',    'Comprimidos'],
  ['code',       'Código'],
  ['text',       'Texto'],
];

export const CLOUD_DATE_FILTERS: [CloudDateFilter, string][] = [
  ['any',   'Cualquier fecha'],
  ['today', 'Hoy'],
  ['week',  'Esta semana'],
  ['month', 'Este mes'],
  ['year',  'Este año'],
];

export const CLOUD_MODIFIED_FILTERS: [CloudModifiedFilter, string][] = [
  ['any',   'Cualquier momento'],
  ['1h',    'Última hora'],
  ['24h',   'Últimas 24 horas'],
  ['7d',    'Últimos 7 días'],
  ['30d',   'Últimos 30 días'],
  ['older', 'Hace más de 30 días'],
];

export const DEFAULT_CLOUD_FILTERS: CloudFilters = { query: '', type: 'all', date: 'any', modified: 'any' };

/** Para comparar nombres: minúsculas y sin tildes. */
export const normalizeName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Inicio del periodo de calendario (la semana empieza el lunes). */
function periodStart(period: Exclude<CloudDateFilter, 'any'>, now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === 'month') d.setDate(1);
  if (period === 'year') d.setMonth(0, 1);
  return d.getTime();
}

const MODIFIED_MS: Record<Exclude<CloudModifiedFilter, 'any' | 'older'>, number> = {
  '1h': HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY,
};

function matches(entry: CloudEntry, f: CloudFilters, now: Date): boolean {
  if (f.query.trim() && !normalizeName(entry.name).includes(normalizeName(f.query))) return false;
  if (f.type === 'folder' && entry.kind !== 'folder') return false;
  if (f.type !== 'all' && f.type !== 'folder' && (entry.kind !== 'file' || entry.type !== f.type)) return false;
  if (f.date !== 'any' && Date.parse(entry.createdAt) < periodStart(f.date, now)) return false;
  if (f.modified !== 'any') {
    const elapsed = now.getTime() - Date.parse(entry.modifiedAt);
    if (f.modified === 'older' ? elapsed <= 30 * DAY : elapsed > MODIFIED_MS[f.modified]) return false;
  }
  return true;
}

/** Contenido visible de una carpeta: filtrado, carpetas primero y por nombre. */
export function visibleEntries(entries: CloudEntry[], filters: CloudFilters): CloudEntry[] {
  const now = new Date();
  return entries
    .filter(e => matches(e, filters, now))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es', { numeric: true }) : a.kind === 'folder' ? -1 : 1));
}

/** Secciones de la nube, en el orden de la columna de navegación. */
export const CLOUD_SECTIONS: { id: CloudSection; label: string; icon: CloudIconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'backups', label: 'Backups', icon: 'backup' },
];

/** Ruta normalizada: sin espacios en los extremos, sin barras dobles ni final. */
export const normalizeCloudPath = (p: string) => p.trim().replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

/** Errores de la configuración de rutas, por sección (sin entrada = válida). */
export function cloudPathErrors(paths: CloudPaths): Partial<Record<CloudSection, string>> {
  const errors: Partial<Record<CloudSection, string>> = {};
  const clean = { home: normalizeCloudPath(paths.home), backups: normalizeCloudPath(paths.backups) };
  for (const { id } of CLOUD_SECTIONS) {
    const p = clean[id];
    if (!p) errors[id] = 'Escribe una ruta.';
    else if (!p.startsWith('/')) errors[id] = 'Debe ser una ruta absoluta (empieza por /).';
    else if (p === '/') errors[id] = 'No puede ser la raíz del sistema.';
    else if (p.split('/').some(seg => seg === '..' || seg === '.')) errors[id] = 'No puede llevar . ni ..';
    else if (/[\0\\:*?"<>|]/.test(p)) errors[id] = 'Tiene caracteres no permitidos.';
  }
  if (!errors.home && !errors.backups) {
    const inside = (a: string, b: string) => a === b || a.startsWith(`${b}/`);
    if (clean.home === clean.backups) errors.backups = 'Home y Backups no pueden usar la misma carpeta.';
    else if (inside(clean.backups, clean.home)) errors.backups = 'Backups no puede estar dentro de Home.';
    else if (inside(clean.home, clean.backups)) errors.home = 'Home no puede estar dentro de Backups.';
  }
  return errors;
}

/** Carpetas que se pueden fijar en la columna de navegación (en cada sección). */
export const MAX_PINNED_FOLDERS = 5;

/** Ruta (ids bajo la raíz) hasta la carpeta `id`, o null si ya no existe. */
export function findFolderPath(root: CloudFolder, id: string): string[] | null {
  for (const e of root.children) {
    if (e.kind !== 'folder') continue;
    if (e.id === id) return [e.id];
    const sub = findFolderPath(e, id);
    if (sub) return [e.id, ...sub];
  }
  return null;
}

/** Carpetas desde la raíz hasta la ruta pedida; se corta en el primer id que no exista. */
export function resolvePath(root: CloudFolder, path: string[]): CloudFolder[] {
  const trail = [root];
  for (const id of path) {
    const next = trail[trail.length - 1].children.find((e): e is CloudFolder => e.kind === 'folder' && e.id === id);
    if (!next) break;
    trail.push(next);
  }
  return trail;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toLocaleString('es', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** «hace 5 minutos», «ayer», o la fecha si pasó más de una semana. */
export function formatModified(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return 'Ahora';
  if (diff < HOUR) return rtf.format(-Math.floor(diff / 60_000), 'minute');
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), 'hour');
  if (diff < 7 * DAY) return rtf.format(-Math.floor(diff / DAY), 'day');
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function folderSummary(folder: CloudFolder): string {
  const n = folder.children.length;
  return n === 0 ? 'Vacía' : `${n} ${n === 1 ? 'elemento' : 'elementos'}`;
}

/** Tipos que el lector abre: los demás solo se descargan. */
const PREVIEWABLE = new Set<CloudFileType>(['word', 'excel', 'pdf', 'image', 'video', 'text', 'code']);
export const isPreviewable = (type: CloudFileType) => PREVIEWABLE.has(type);

/** Imágenes y videos se muestran con su miniatura en lugar del icono. */
export const hasThumbnail = (type: CloudFileType) => type === 'image' || type === 'video';

/* ── Carga de archivos ──────────────────────────────────────────────── */

/** Archivo soltado: ruta relativa a lo que se arrastró ("fotos/2026/a.jpg"). */
export interface DroppedFile {
  relPath: string;
  size: number;
}

/** Resumen de lo soltado para la notificación de carga. */
export function describeDrop(files: DroppedFile[]): { label: string; fileCount: number; bytes: number } {
  const roots = new Set(files.map(f => f.relPath.split('/')[0]));
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  const [first] = roots;
  const label = roots.size === 1 ? first : `${roots.size} elementos`;
  return { label, fileCount: files.length, bytes };
}

/**
 * Por qué no vale un nombre para una carpeta o un archivo entre `siblings`,
 * o null si vale. `exceptId` es el propio elemento al cambiarle el nombre.
 */
export function entryNameError(name: string, siblings: CloudEntry[], kind: CloudEntry['kind'], exceptId?: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Escribe un nombre.';
  if (clean.length > 120) return 'El nombre no puede pasar de 120 caracteres.';
  if (/[\\/:*?"<>|]/.test(clean)) return 'El nombre no puede llevar / \\ : * ? " < > |';
  if (clean === '.' || clean === '..') return 'Ese nombre no está permitido.';
  if (siblings.some(e => e.id !== exceptId && e.kind === kind && normalizeName(e.name) === normalizeName(clean))) {
    return kind === 'folder' ? 'Ya hay una carpeta con ese nombre aquí.' : 'Ya hay un archivo con ese nombre aquí.';
  }
  return null;
}

export const folderNameError = (name: string, siblings: CloudEntry[]) => entryNameError(name, siblings, 'folder');

/** Si `id` es la carpeta `folder` o está dentro de ella. */
export function containsEntry(folder: CloudFolder, id: string): boolean {
  return folder.id === id || folder.children.some(e => e.id === id || (e.kind === 'folder' && containsEntry(e, id)));
}

/** «2 carpetas y 3 archivos». */
export function describeEntries(entries: CloudEntry[]): string {
  const folders = entries.filter(e => e.kind === 'folder').length;
  const files = entries.length - folders;
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
  return [part(folders, 'carpeta', 'carpetas'), part(files, 'archivo', 'archivos')].filter(Boolean).join(' y ');
}
