import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@services/cloud.api';
import { CLOUD_SECTIONS } from '@utils/cloud';
import type { CloudConnection, CloudFolder, CloudSection } from '@typings/cloud.types';

/* Claves por servidor y usuario: cambiar de nube no mezcla cachés. */
const scope = (c: CloudConnection | null) => ['cloud', c?.url ?? '', c?.username ?? ''] as const;
export const CLOUD_KEYS = {
  all: (c: CloudConnection | null) => scope(c),
  tree: (c: CloudConnection | null, section: CloudSection) => [...scope(c), 'tree', section] as const,
  storage: (c: CloudConnection | null) => [...scope(c), 'storage'] as const,
  paths: (c: CloudConnection | null) => [...scope(c), 'paths'] as const,
};

/** Raíz vacía de una sección: lo que se ve mientras carga o sin conexión. */
export function emptyRoot(section: CloudSection): CloudFolder {
  const label = CLOUD_SECTIONS.find(s => s.id === section)?.label ?? section;
  return { kind: 'folder', id: section, name: label, createdAt: '', modifiedAt: '', children: [] };
}

/**
 * Árbol de una sección. La nube da a la raíz el id vacío; aquí toma el de la
 * sección (`home`, `backups`) para que las dos raíces no se confundan. Los
 * demás ids son la ruta relativa, que es lo que pide la API.
 */
export function useCloudTree(connection: CloudConnection | null, section: CloudSection, enabled: boolean) {
  return useQuery({
    queryKey: CLOUD_KEYS.tree(connection, section),
    queryFn: async () => ({ ...(await cloudApi.tree(section)), id: section }),
    enabled: enabled && Boolean(connection),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useCloudStorage(connection: CloudConnection | null, enabled: boolean) {
  return useQuery({
    queryKey: CLOUD_KEYS.storage(connection),
    queryFn: () => cloudApi.storage(),
    enabled: enabled && Boolean(connection),
    staleTime: 30_000,
    retry: false,
  });
}

export function useCloudPathsConfig(connection: CloudConnection | null, enabled: boolean) {
  return useQuery({
    queryKey: CLOUD_KEYS.paths(connection),
    queryFn: () => cloudApi.getPaths(),
    enabled: enabled && Boolean(connection),
    staleTime: 60_000,
    retry: false,
  });
}

/** Vuelve a pedir árboles y almacenamiento después de un cambio en la nube. */
export function useCloudRefresh(connection: CloudConnection | null) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: CLOUD_KEYS.all(connection) }),
    [queryClient, connection],
  );
}
