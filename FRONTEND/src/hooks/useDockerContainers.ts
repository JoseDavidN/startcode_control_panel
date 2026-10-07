import { useQuery } from '@tanstack/react-query';
import { dockerService } from '@services/docker.service';

/**
 * Contenedores en ejecución, leídos por SSH. Solo se piden con el tab abierto
 * y se refrescan cada 15 s: cada lectura abre una conexión y corre
 * `docker stats`, así que no conviene hacerlo más a menudo. Con error (p. ej.
 * falta la contraseña de sudo) se deja de sondear hasta que se reintente.
 *
 * La contraseña de sudo no va en la queryKey: así no queda en la caché de
 * React Query ni en las devtools. React Query usa siempre el queryFn del
 * último render, así que el refetch ya la lleva.
 */
export function useDockerContainers(serverId: string, enabled: boolean, sudoPassword?: string) {
  return useQuery({
    queryKey: ['dockerContainers', serverId],
    queryFn: () => dockerService.listContainers(serverId, sudoPassword),
    enabled: Boolean(serverId) && enabled,
    refetchInterval: query => (query.state.error ? false : 15_000),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: false,
  });
}
