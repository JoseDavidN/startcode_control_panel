// src/hooks/useServers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serverService } from '@services/server.service';
import type { UpdateServerDto } from '@services/server.service';

/**
 * Hook para obtener todos los servidores del usuario
 */
export function useServers() {
	return useQuery({
		queryKey: ['servers'],
		queryFn: () => serverService.getServers(),
		staleTime: 1000 * 30, // 30 segundos
		// refetchInterval: 1000 * 60, // Refrescar cada minuto
	});
}

/**
 * Hook para obtener un servidor específico por ID
 */
export function useServer(id: string) {
	return useQuery({
		queryKey: ['server', id],
		queryFn: () => serverService.getServer(id),
		enabled: !!id,
		staleTime: 1000 * 30,
	});
}

/**
 * Hook para crear un servidor
 */
export function useCreateServer() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: serverService.createServer,
		onSuccess: () => {
			// Invalidar la query de servidores para que se recargue
			queryClient.invalidateQueries({ queryKey: ['servers'] });
		},
	});
}

/**
 * Hook para actualizar un servidor
 */
export function useUpdateServer() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateServerDto }) =>
			serverService.updateServer(id, data),
		onSuccess: (_res, { id }) => {
			void queryClient.invalidateQueries({ queryKey: ['servers'] });
			void queryClient.invalidateQueries({ queryKey: ['server', id] });
		},
	});
}

/**
 * Hook para eliminar un servidor
 */
export function useDeleteServer() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => serverService.deleteServer(id),
		onSuccess: () => {
			// Invalidar la query de servidores para que se recargue
			queryClient.invalidateQueries({ queryKey: ['servers'] });
		},
	});
}

/**
 * Hook para actualizar quickstats de todos los servidores
 * Ejecuta quickstats y luego refresca la lista de servidores
 */
export function useRefreshAllServers() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => serverService.refreshAllServersStats(),
		onSuccess: () => {
			// Invalidar y refrescar la query de servidores para obtener datos actualizados
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			queryClient.refetchQueries({ queryKey: ['servers'] });
		},
	});
}
