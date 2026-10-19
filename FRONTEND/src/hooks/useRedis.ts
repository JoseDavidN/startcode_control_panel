// src/hooks/useRedis.ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { redisApi } from '@services/redis.api';
import { useAuth } from '@hooks/useAuth';
import { DATABASE_KEYS } from '@hooks/useDatabases';
import { isReadCommand } from '@utils/redis';
import type { RedisEditInput, RedisKeyType } from '@typings/redis.types';

/* Bajo la de la conexión y con la sesión: al reconectar se vuelve a pedir todo. */
export const REDIS_KEYS = {
	all: (id: string) => ['databases', id, 'redis'] as const,
	overview: (id: string, sessionId: string) => ['databases', id, 'redis', sessionId, 'overview'] as const,
	scan: (id: string, sessionId: string, db: number, pattern: string, type: RedisKeyType | null) =>
		['databases', id, 'redis', sessionId, 'scan', db, pattern, type] as const,
	key: (id: string, sessionId: string, db: number, key: string) => ['databases', id, 'redis', sessionId, 'key', db, key] as const,
};

/** Versión, memoria y claves por base. */
export function useRedisOverview(id: string, sessionId: string | null) {
	const { isAuthenticated } = useAuth();
	return useQuery({
		queryKey: REDIS_KEYS.overview(id, sessionId ?? ''),
		queryFn: () => redisApi.overview(id, sessionId!),
		enabled: isAuthenticated && Boolean(sessionId),
		retry: false,
		staleTime: 1000 * 30,
	});
}

/** Claves de una base, por páginas de SCAN («Cargar más» pide la siguiente). */
export function useRedisScan(id: string, sessionId: string | null, db: number, pattern: string, type: RedisKeyType | null) {
	const { isAuthenticated } = useAuth();
	return useInfiniteQuery({
		queryKey: REDIS_KEYS.scan(id, sessionId ?? '', db, pattern, type),
		queryFn: ({ pageParam }) => redisApi.scan(id, sessionId!, db, pattern, pageParam, type ?? undefined),
		initialPageParam: '0',
		getNextPageParam: last => (last.cursor === '0' ? undefined : last.cursor),
		enabled: isAuthenticated && Boolean(sessionId),
		retry: false,
		staleTime: 1000 * 30,
	});
}

export function useRedisKey(id: string, sessionId: string | null, db: number, key: string | null) {
	const { isAuthenticated } = useAuth();
	return useQuery({
		queryKey: REDIS_KEYS.key(id, sessionId ?? '', db, key ?? ''),
		queryFn: () => redisApi.key(id, sessionId!, db, key!),
		enabled: isAuthenticated && Boolean(sessionId) && key !== null,
		retry: false,
	});
}

/* Un cambio puede tocar la lista (tipo, caducidad, nombre), el valor y el
   recuento de la base: se vuelve a pedir todo lo de Redis de la conexión. */
function useRedisInvalidate(id: string) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: REDIS_KEYS.all(id) });
}

export function useRedisEdit(id: string, sessionId: string | null, db: number) {
	const invalidate = useRedisInvalidate(id);
	return useMutation({
		mutationFn: (input: RedisEditInput) => {
			if (!sessionId) return Promise.reject(new Error('La vista todavía no está conectada'));
			return redisApi.edit(id, sessionId, db, input);
		},
		onSuccess: () => invalidate(),
	});
}

export function useRedisDelete(id: string, sessionId: string | null, db: number) {
	const queryClient = useQueryClient();
	const invalidate = useRedisInvalidate(id);
	return useMutation({
		mutationFn: (keys: string[]) => {
			if (!sessionId) return Promise.reject(new Error('La vista todavía no está conectada'));
			return redisApi.remove(id, sessionId, db, keys);
		},
		/* Queda en la auditoría salga bien o mal. */
		onSettled: () => {
			void invalidate();
			void queryClient.invalidateQueries({ queryKey: DATABASE_KEYS.audit(id) });
		},
	});
}

export function useRedisCommand(id: string, sessionId: string | null) {
	const queryClient = useQueryClient();
	const invalidate = useRedisInvalidate(id);
	return useMutation({
		mutationFn: ({ db, command, confirm }: { db: number; command: string; confirm?: boolean }) => {
			if (!sessionId) return Promise.reject(new Error('La vista todavía no está conectada'));
			return redisApi.command(id, sessionId, db, command, confirm);
		},
		/* Tras uno que puede escribir, la lista y el valor abierto se refrescan. */
		onSettled: (_data, _err, vars) => {
			if (!isReadCommand(vars.command)) void invalidate();
			if (vars.confirm) void queryClient.invalidateQueries({ queryKey: DATABASE_KEYS.audit(id) });
		},
	});
}
