// src/hooks/useSessions.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@services/auth.api';
import { useAuth } from '@hooks/useAuth';

/** Sesiones abiertas del usuario. Con sesión única, la lista trae una fila. */
export function useSessions() {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: ['sessions'],
		queryFn: () => authApi.listSessions(),
		enabled: isAuthenticated,
		retry: false,
		staleTime: 1000 * 30,
	});
}

export function useRevokeSession() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => authApi.revokeSession(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['sessions'] });
		},
	});
}
