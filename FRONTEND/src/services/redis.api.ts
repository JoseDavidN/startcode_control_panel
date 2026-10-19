// src/services/redis.api.ts
import { apiService } from '@services/api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	RedisCommandResult,
	RedisEditInput,
	RedisKeyDetail,
	RedisOverview,
	RedisScanResult,
	RedisKeyType,
} from '@typings/redis.types';

/** El backend responde el objeto directo; axios lo envuelve en `data`. */
function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

const BASE = API_CONFIG.ENDPOINTS.DATABASES;

/* Todas van con la sesión de la vista (`sessionId`) y la base (`db`, 0–15). */
export const redisApi = {
	async overview(id: string, sessionId: string): Promise<RedisOverview> {
		return unwrap<RedisOverview>(await apiService.get<RedisOverview>(`${BASE}/${id}/redis/overview?session=${sessionId}`));
	},

	/** Una página de claves (SCAN). `cursor` '0' empieza; la respuesta trae el de la siguiente. */
	async scan(id: string, sessionId: string, db: number, pattern: string, cursor: string, type?: RedisKeyType): Promise<RedisScanResult> {
		return unwrap<RedisScanResult>(
			await apiService.post<RedisScanResult>(`${BASE}/${id}/redis/scan`, { sessionId, db, pattern, cursor, ...(type ? { type } : {}) })
		);
	},

	async key(id: string, sessionId: string, db: number, key: string): Promise<RedisKeyDetail> {
		return unwrap<RedisKeyDetail>(await apiService.post<RedisKeyDetail>(`${BASE}/${id}/redis/key`, { sessionId, db, key }));
	},

	async edit(id: string, sessionId: string, db: number, input: RedisEditInput): Promise<void> {
		await apiService.post(`${BASE}/${id}/redis/edit`, { sessionId, db, ...input });
	},

	/** UNLINK; queda en la auditoría de la conexión. */
	async remove(id: string, sessionId: string, db: number, keys: string[]): Promise<{ deleted: number }> {
		return unwrap<{ deleted: number }>(await apiService.post<{ deleted: number }>(`${BASE}/${id}/redis/delete`, { sessionId, db, keys }));
	},

	/** Un comando peligroso responde 400 `DANGEROUS_QUERY` hasta que llega con `confirm`. */
	async command(id: string, sessionId: string, db: number, command: string, confirm = false): Promise<RedisCommandResult> {
		return unwrap<RedisCommandResult>(
			await apiService.post<RedisCommandResult>(`${BASE}/${id}/redis/command`, { sessionId, db, command, ...(confirm ? { confirm: true } : {}) })
		);
	},
};
