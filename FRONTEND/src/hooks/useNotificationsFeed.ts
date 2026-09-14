// src/hooks/useNotificationsFeed.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@services/notifications.api';
import { useAuth } from '@hooks/useAuth';
import type { NotificationQuery } from '@typings/notification.types';

export const NOTIF_KEYS = {
	list: (q: NotificationQuery) => ['notifications', q] as const,
	unread: ['notifications', 'unread-count'] as const,
};

/* Sin sesión no se consulta: un 401 hace que el interceptor de api.service
   limpie los tokens y navegue a /login con window.location, es decir, recarga
   entera. Disparar esto desde la pantalla de login deja la app en bucle. */

/** Lista paginada con filtros. */
export function useNotificationsList(query: NotificationQuery) {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: NOTIF_KEYS.list(query),
		queryFn: () => notificationsApi.list(query),
		enabled: isAuthenticated,
		retry: false,
		staleTime: 1000 * 15,
	});
}

/** Contador del badge. Se refresca solo y con el evento del WebSocket. */
export function useUnreadCount() {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: NOTIF_KEYS.unread,
		queryFn: () => notificationsApi.unreadCount(),
		enabled: isAuthenticated,
		retry: false,
		staleTime: 1000 * 15,
		refetchInterval: isAuthenticated ? 1000 * 60 : false,
		refetchOnWindowFocus: true,
	});
}

function useNotificationsMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['notifications'] });
		},
	});
}

export const useMarkNotificationsRead = () =>
	useNotificationsMutation((ids: string[]) => notificationsApi.markRead(ids));

export const useMarkAllNotificationsRead = () =>
	useNotificationsMutation(() => notificationsApi.markAllRead());

export const useRemoveNotification = () =>
	useNotificationsMutation((id: string) => notificationsApi.remove(id));

export const useClearNotifications = () =>
	useNotificationsMutation(() => notificationsApi.clearAll());
