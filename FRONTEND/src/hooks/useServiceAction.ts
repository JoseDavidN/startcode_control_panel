import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceControlService, type ServiceAction } from '@services/service-control.service';

export interface ServiceActionVars {
  serviceName: string;
  action: ServiceAction;
  /** Solo se envía tras un `SUDO_REQUIRED`; nunca se persiste. */
  sudoPassword?: string;
}

export function useServiceAction(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceName, action, sudoPassword }: ServiceActionVars) =>
      serviceControlService.executeAction(serverId, serviceName, action, sudoPassword),
    /* En `onSettled` y no en `onSuccess`: un `success: false` también deja el
       servicio en un estado distinto al que muestra la tarjeta. */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['serverDetail', serverId] });
      void queryClient.invalidateQueries({ queryKey: ['servers-summary'] });
    },
  });
}

export interface KillProcessVars {
  pid: number;
  /** Solo se envía tras un `SUDO_REQUIRED`; nunca se persiste. */
  sudoPassword?: string;
}

/** Cierra un proceso con SIGTERM. */
export function useKillProcess(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pid, sudoPassword }: KillProcessVars) =>
      serviceControlService.killProcess(serverId, pid, sudoPassword),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['serverDetail', serverId] });
    },
  });
}

/**
 * Journal de una unidad. Solo se pide cuando hay un servicio abierto, y no se
 * cachea entre aperturas: unos logs de hace diez minutos no sirven para
 * diagnosticar lo que está pasando ahora.
 */
export function useServiceLogs(serverId: string, serviceName: string | null, lines = 200) {
  return useQuery({
    queryKey: ['serviceLogs', serverId, serviceName, lines],
    queryFn: () => serviceControlService.readLogs(serverId, serviceName as string, { lines }),
    enabled: Boolean(serverId && serviceName),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** Fija o suelta unidades. El backend guarda la lista entera. */
export function usePinnedServices(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (services: string[]) => serviceControlService.setPinned(serverId, services),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['serverDetail', serverId] });
    },
  });
}
