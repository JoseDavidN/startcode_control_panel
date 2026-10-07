import { useQuery } from '@tanstack/react-query';
import bundled from '@/release/versions.json';

export type ReleaseType = 'major' | 'minor' | 'patch';
export type ChangeSection = 'added' | 'changed' | 'fixed' | 'removed' | 'security';

export interface ReleaseEntry {
  version: string;
  type: ReleaseType;
  date: string;
  title?: string;
  changes: Partial<Record<ChangeSection, string[]>>;
}

interface Catalog { versions: ReleaseEntry[] }

const RELEASES_URL = String(import.meta.env.VITE_RELEASES_URL || 'https://releases.startcode.com.co').replace(/\/$/, '');
export const VERSIONS_URL = `${RELEASES_URL}/startcode-panel/versions.json`;

const parse = (v: string) => v.split('.').map(n => Number(n) || 0);
/** Positivo si a > b. */
export const compareVersions = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

const merge = (local: ReleaseEntry[], remote: ReleaseEntry[]) => {
  const byVersion = new Map(local.map(v => [v.version, v]));
  for (const v of remote) byVersion.set(v.version, v);
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
};

/**
 * Novedades por versión. La copia empaquetada con la app cubre hasta la
 * versión instalada y funciona sin red; la del sitio de releases añade las
 * posteriores (lo que trae la siguiente actualización). Si el sitio no
 * responde, se queda la empaquetada.
 */
export function useReleaseNotes() {
  const local = (bundled as Catalog).versions;

  const query = useQuery({
    queryKey: ['release-notes'],
    queryFn: async (): Promise<ReleaseEntry[]> => {
      const response = await fetch(VERSIONS_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = (await response.json()) as Catalog;
      return Array.isArray(catalog.versions) ? catalog.versions : [];
    },
    staleTime: 30 * 60_000,
    retry: false,
  });

  return {
    versions: merge(local, query.data ?? []),
    remoteError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
