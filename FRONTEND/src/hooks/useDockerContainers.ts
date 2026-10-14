import { useQuery } from '@tanstack/react-query';
import { dockerService } from '@services/docker.service';

/**
 * Contenedores en ejecución, leídos por SSH cada vez que se entra al tab.
 * Mientras está abierto no se refrescan solos (cada lectura abre una conexión
 * y corre `docker stats`): se vuelve a leer con el botón Actualizar.
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
    /* Entrar al tab siempre lee de nuevo; mientras se está en él, nada automático. */
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
