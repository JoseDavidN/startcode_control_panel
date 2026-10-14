import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRealtimeSocket } from '@contexts/RealtimeMetricsContext';
import { serviceInstallService, type InstallMode, type InstallStep } from '@services/service-install.service';

/**
 * Instala o desinstala por completo un servicio en el servidor y sigue sus pasos. El progreso llega por
 * el socket del panel (`service:install:progress`); la respuesta HTTP trae
 * además todos los pasos, así que sin socket solo se pierde la animación.
 */
export function useServiceInstall(serverId: string) {
  const queryClient = useQueryClient();
  const { socket } = useRealtimeSocket();
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const active = useRef<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onProgress = (payload: { serverId: string; service: string; step: InstallStep }) => {
      if (payload.serverId !== serverId || payload.service !== active.current) return;
      setSteps(prev => {
        const i = prev.findIndex(s => s.id === payload.step.id);
        if (i < 0) return [...prev, payload.step];
        const next = [...prev];
        next[i] = payload.step;
        return next;
      });
    };
    socket.on('service:install:progress', onProgress);
    return () => { socket.off('service:install:progress', onProgress); };
  }, [socket, serverId]);

  const mutation = useMutation({
    mutationFn: ({ mode, service, sudoPassword }: { mode: InstallMode; service: string; sudoPassword?: string }) => {
      active.current = service;
      setSteps([]);
      return serviceInstallService.run(serverId, mode, service, sudoPassword);
    },
    onSuccess: result => {
      /* Los pasos de la respuesta mandan: cubren los que el socket no trajo. */
      setSteps(result.steps);
      /* El inventario de servicios lo manda el agente; se pide de nuevo el detalle. */
      void queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      void queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const reset = useCallback(() => {
    active.current = null;
    setSteps([]);
    mutation.reset();
  }, [mutation]);

  return { ...mutation, steps, reset };
}
