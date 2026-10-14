import { useQuery } from '@tanstack/react-query';
import { kubernetesService } from '@services/kubernetes.service';

/**
 * Pods del servidor, leídos por SSH cada vez que se entra al tab. Mientras
 * está abierto no se refrescan solos (cada lectura abre una conexión y corre
 * kubectl): se vuelve a leer con el botón Actualizar. La contraseña de sudo
 * no va en la queryKey, igual que en `useDockerContainers`.
 */
export function useKubernetesPods(serverId: string, enabled: boolean, sudoPassword?: string) {
  return useQuery({
    queryKey: ['kubernetesPods', serverId],
    queryFn: () => kubernetesService.listPods(serverId, sudoPassword),
    enabled: Boolean(serverId) && enabled,
    refetchInterval: false,
    /* Entrar al tab siempre lee de nuevo; mientras se está en él, nada automático. */
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
