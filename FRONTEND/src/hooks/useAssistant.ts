// src/hooks/useAssistant.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assistantApi } from '@services/assistant.api';
import { useAuth } from '@hooks/useAuth';
import { useEffect, useState } from 'react';
import type { AiProvider, AssistantConfigForm, AssistantContextItem, ChatMessage } from '@typings/assistant.types';

/* Con el id de usuario en la clave: cada cuenta tiene su propio asistente. */
export const ASSISTANT_KEYS = {
	config: (userId: string) => ['assistant', userId, 'config'] as const,
	messages: (userId: string) => ['assistant', userId, 'messages'] as const,
	memory: (userId: string) => ['assistant', userId, 'memory'] as const,
	/* La clave no va en la clave de caché: solo si hay una escrita y su largo, para refetchear al cambiarla. */
	models: (userId: string, provider: AiProvider, keyTag: string) => ['assistant', userId, 'models', provider, keyTag] as const,
};

/** Valor que solo cambia cuando deja de cambiar durante `ms` (para no pedir modelos por cada tecla). */
function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

/**
 * Modelos disponibles del proveedor, pedidos en vivo: se actualizan al
 * cambiar de proveedor o de clave, al volver a la ventana y cada 10 minutos.
 * Sin clave escrita usa la guardada, si es del mismo proveedor.
 */
export function useAssistantModels(provider: AiProvider, apiKey: string, hasSavedKey: boolean) {
	const { user, isAuthenticated } = useAuth();
	const key = useDebounced(apiKey.trim(), 600);
	const queryClient = useQueryClient();
	const usable = key.length >= 8 || (key === '' && hasSavedKey);
	const queryKey = ASSISTANT_KEYS.models(user?.id ?? '', provider, key ? `typed:${key.length}:${key.slice(-4)}` : 'saved');
	const query = useQuery({
		queryKey,
		queryFn: () => assistantApi.listModels(provider, key || undefined),
		enabled: isAuthenticated && Boolean(user?.id) && usable,
		retry: false,
		staleTime: 1000 * 60 * 10,
		refetchInterval: 1000 * 60 * 10,
		refetchOnWindowFocus: true,
	});
	/* «Actualizar»: salta también la caché de 10 minutos del backend. */
	const refresh = () => queryClient.fetchQuery({
		queryKey,
		queryFn: () => assistantApi.listModels(provider, key || undefined, true),
		staleTime: 0,
	});
	return { query, usable, refresh };
}

/** Configuración del asistente del usuario actual (null si no hay ninguno conectado). */
export function useAssistantConfig() {
	const { user, isAuthenticated } = useAuth();
	return useQuery({
		queryKey: ASSISTANT_KEYS.config(user?.id ?? ''),
		queryFn: () => assistantApi.getConfig(),
		enabled: isAuthenticated && Boolean(user?.id),
		retry: false,
		staleTime: 1000 * 60,
	});
}

export function useSaveAssistantConfig() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (form: AssistantConfigForm) => assistantApi.saveConfig(form),
		onSuccess: data => queryClient.setQueryData(ASSISTANT_KEYS.config(user?.id ?? ''), data),
	});
}

export function useDeleteAssistantConfig() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => assistantApi.deleteConfig(),
		onSuccess: () => queryClient.setQueryData(ASSISTANT_KEYS.config(user?.id ?? ''), null),
	});
}

export function useTestAssistant() {
	return useMutation({ mutationFn: () => assistantApi.test() });
}

/** Conversación guardada: persiste entre sesiones, equipos y proveedores. */
export function useAssistantMessages(enabled = true) {
	const { user, isAuthenticated } = useAuth();
	return useQuery({
		queryKey: ASSISTANT_KEYS.messages(user?.id ?? ''),
		queryFn: () => assistantApi.history(),
		enabled: enabled && isAuthenticated && Boolean(user?.id),
		retry: false,
		staleTime: 1000 * 30,
	});
}

export function useAssistantMemory() {
	const { user, isAuthenticated } = useAuth();
	return useQuery({
		queryKey: ASSISTANT_KEYS.memory(user?.id ?? ''),
		queryFn: () => assistantApi.memory(),
		enabled: isAuthenticated && Boolean(user?.id),
		retry: false,
	});
}

/**
 * Envía una pregunta. Se muestra al instante y, con la respuesta, se
 * sustituye por lo que guardó el backend (ya sin secretos).
 */
export function useSendAssistantMessage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const key = ASSISTANT_KEYS.messages(user?.id ?? '');
	return useMutation({
		mutationFn: ({ message, context }: { message: string; context: AssistantContextItem[] }) =>
			assistantApi.chat(message, context),
		onMutate: async ({ message }) => {
			await queryClient.cancelQueries({ queryKey: key });
			const pending: ChatMessage = {
				id: `pending-${Date.now()}`, role: 'user', content: message,
				provider: null, model: null, createdAt: new Date().toISOString(),
			};
			queryClient.setQueryData<ChatMessage[]>(key, prev => [...(prev ?? []), pending]);
			return { pendingId: pending.id };
		},
		onSuccess: (res, _vars, ctx) => {
			queryClient.setQueryData<ChatMessage[]>(key, prev =>
				[...(prev ?? []).filter(m => m.id !== ctx?.pendingId), res.question, res.answer]);
			void queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.memory(user?.id ?? '') });
		},
		/* El backend no guarda una pregunta sin respuesta: tampoco se queda aquí. */
		onError: (_err, _vars, ctx) => {
			queryClient.setQueryData<ChatMessage[]>(key, prev => (prev ?? []).filter(m => m.id !== ctx?.pendingId));
		},
	});
}

export function useClearAssistantMemory() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => assistantApi.clearMemory(),
		onSuccess: () => {
			queryClient.setQueryData(ASSISTANT_KEYS.messages(user?.id ?? ''), []);
			void queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.memory(user?.id ?? '') });
		},
	});
}
