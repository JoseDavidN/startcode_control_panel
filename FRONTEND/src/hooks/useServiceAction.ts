import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceControlService, type ServiceAction } from '@services/service-control.service';

export function useServiceAction(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceName, action }: { serviceName: string; action: ServiceAction }) =>
      serviceControlService.executeAction(serverId, serviceName, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverDetail', serverId] });
    },
  });
}
