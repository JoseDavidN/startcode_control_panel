import type { Section } from '@/common/sections';
import type { CloudFileType } from './file-types';
import type { CloudEntryDto, CloudFileDto, CloudFolderDto } from './files.types';

/** Días de la gráfica de actividad del dashboard, hoy incluido. */
export const ACTIVITY_DAYS = 30;
const LARGEST = 5;

export interface CloudStatsDto {
  sections: Record<Section, { files: number; bytes: number }>;
  /** De mayor a menor tamaño; solo los tipos que tienen archivos. */
  byType: { type: CloudFileType; files: number; bytes: number }[];
  /** Un día por elemento (`YYYY-MM-DD`, UTC), del más antiguo a hoy; días sin cambios a cero. */
  activity: { date: string; files: number; bytes: number }[];
  largest: { section: Section; id: string; name: string; type: CloudFileType; size: number; modifiedAt: string }[];
  /** Alguna sección pasó de `CLOUD_TREE_MAX_ENTRIES`: las cifras se quedan cortas. */
  truncated: boolean;
  generatedAt: string;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function* filesOf(entry: CloudEntryDto): Generator<CloudFileDto> {
  if (entry.kind === 'file') { yield entry; return; }
  for (const child of entry.children) yield* filesOf(child);
}

/**
 * Resumen de la nube para el dashboard a partir de los árboles de cada
 * sección: tamaño y archivos por sección y por tipo, archivos nuevos o
 * modificados por día (por `modifiedAt`) y los más grandes.
 */
export function aggregateStats(
  trees: Record<Section, CloudFolderDto>,
  truncated: boolean,
  now = new Date(),
): CloudStatsDto {
  const sections = {} as CloudStatsDto['sections'];
  const types = new Map<CloudFileType, { files: number; bytes: number }>();

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (ACTIVITY_DAYS - 1 - i));
    return { date: dayKey(d), files: 0, bytes: 0 };
  });
  const byDay = new Map(activity.map(a => [a.date, a]));

  let largest: CloudStatsDto['largest'] = [];

  for (const section of Object.keys(trees) as Section[]) {
    const total = { files: 0, bytes: 0 };
    for (const f of filesOf(trees[section])) {
      total.files++;
      total.bytes += f.size;
      const t = types.get(f.type) ?? { files: 0, bytes: 0 };
      t.files++;
      t.bytes += f.size;
      types.set(f.type, t);

      const day = byDay.get(f.modifiedAt.slice(0, 10));
      if (day) { day.files++; day.bytes += f.size; }

      if (largest.length < LARGEST || f.size > largest[largest.length - 1].size) {
        largest.push({ section, id: f.id, name: f.name, type: f.type, size: f.size, modifiedAt: f.modifiedAt });
        largest = largest.sort((a, b) => b.size - a.size).slice(0, LARGEST);
      }
    }
    sections[section] = total;
  }

  return {
    sections,
    byType: [...types].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.bytes - a.bytes),
    activity,
    largest,
    truncated,
    generatedAt: now.toISOString(),
  };
}
