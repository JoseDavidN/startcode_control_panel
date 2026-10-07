import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commandService, type ExecCommandInput } from '@services/command.service';

/** Ejecuta un comando y refresca la auditoría del servidor al terminar. */
export function useExecCommand(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ExecCommandInput) => commandService.exec(serverId, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['commandHistory', serverId] });
    },
  });
}

/** Auditoría: últimos comandos del servidor de cualquier usuario. */
export function useCommandHistory(serverId: string, enabled = true) {
  return useQuery({
    queryKey: ['commandHistory', serverId],
    queryFn: () => commandService.history(serverId, 50),
    enabled: Boolean(serverId) && enabled,
    staleTime: 15_000,
  });
}
