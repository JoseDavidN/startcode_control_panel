// src/hooks/useServers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serverService } from '@services/server.service';
import type { CreateServerDto, Server, UpdateServerDto } from '@services/server.service';

/**
 * Hook para obtener todos los servidores del usuario
 */
export function useServers() {
	return useQuery({
		queryKey: ['servers'],
		queryFn: () => serverService.getServers(),
		staleTime: 1000 * 30,
		/* Por query, no en el cliente global: activarlo allí arrastraría
		   sesiones, perfil y ajustes. */
		refetchOnWindowFocus: true,
		/* Red de seguridad: los datos vivos llegan por WebSocket y por
		   ['servers-summary']; esto solo recoge cambios estructurales. */
		refetchInterval: 1000 * 60 * 5,
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
		mutationFn: (data: CreateServerDto) => serverService.createServer(data),
		onSuccess: () => {
			// Invalidar la query de servidores para que se recargue
			void queryClient.invalidateQueries({ queryKey: ['servers'] });
		},
	});
}

/**
 * Hook para actualizar un servidor
 */
/**
 * Marca o quita un favorito. Se aplica al instante en la lista y, si el
 * backend lo rechaza (ya hay 3), vuelve a como estaba.
 */
export function useSetServerFavorite() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => serverService.setFavorite(id, favorite),
		onMutate: async ({ id, favorite }) => {
			await queryClient.cancelQueries({ queryKey: ['servers'] });
			const previous = queryClient.getQueryData<Server[]>(['servers']);
			queryClient.setQueryData<Server[]>(['servers'], list => list?.map(s =>
				s.id === id ? { ...s, favoritedAt: favorite ? new Date().toISOString() : null } : s));
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(['servers'], ctx.previous);
		},
		onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['servers'] }); },
	});
}

/** Acepta la nueva clave de host SSH de un servidor (aviso de huella cambiada). */
export function useAcceptHostKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, fingerprint }: { id: string; fingerprint: string }) =>
			serverService.acceptHostKey(id, fingerprint),
		onSuccess: (_res, { id }) => {
			void queryClient.invalidateQueries({ queryKey: ['servers'] });
			void queryClient.invalidateQueries({ queryKey: ['server', id] });
		},
	});
}

/** Cambia la llave privada SSH de un servidor. */
export function useUpdateServerKey() {
	return useMutation({
		mutationFn: ({ id, privateKey }: { id: string; privateKey: string }) =>
			serverService.updatePrivateKey(id, privateKey),
	});
}

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
		mutationFn: (vars: string | { id: string; force?: boolean; sudoPassword?: string }) =>
			typeof vars === 'string'
				? serverService.deleteServer(vars)
				: serverService.deleteServer(vars.id, {
						force: vars.force,
						sudoPassword: vars.sudoPassword,
					}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['servers'] });
			void queryClient.invalidateQueries({ queryKey: ['servers-summary'] });
		},
	});
}

/**
 * Refresca la lista de verdad: la estructura (`/servers`) y las métricas
 * (`/agent-data/servers-summary`).
 *
 * Antes llamaba a `refreshAllServersStats()`, que era un `getServers()` con
 * otro nombre: el botón hacía una petición y no recalculaba nada.
 */
export function useRefreshAllServers() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			await Promise.all([
				queryClient.refetchQueries({ queryKey: ['servers'] }),
				queryClient.refetchQueries({ queryKey: ['servers-summary'] }),
			]);
		},
	});
}
