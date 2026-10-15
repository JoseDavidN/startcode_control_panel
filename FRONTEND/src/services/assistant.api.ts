// src/services/assistant.api.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	AssistantChatResponse,
	AssistantConfig,
	AssistantConfigForm,
	AssistantContextItem,
	AssistantMemoryStatus,
	AiModelList,
	AiProvider,
	ChatMessage,
} from '@typings/assistant.types';

/** El backend responde el objeto directo; axios lo envuelve en `data`. */
function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

const BASE = API_CONFIG.ENDPOINTS.ASSISTANT;
/* El modelo puede tardar bastante más que el resto de la API. */
const CHAT_TIMEOUT = 150_000;

export const assistantApi = {
	async getConfig(): Promise<AssistantConfig | null> {
		const data = unwrap<AssistantConfig | null | ''>(await apiService.get<AssistantConfig | null>(`${BASE}/config`));
		return data && typeof data === 'object' && 'provider' in data ? data : null;
	},

	async saveConfig(form: AssistantConfigForm): Promise<AssistantConfig> {
		return unwrap<AssistantConfig>(await apiService.put<AssistantConfig>(`${BASE}/config`, form));
	},

	async deleteConfig(): Promise<void> {
		await apiService.delete(`${BASE}/config`);
	},

	/** Modelos disponibles; sin `apiKey`, con la guardada (si es del mismo proveedor). */
	async listModels(provider: AiProvider, apiKey?: string, refresh = false): Promise<AiModelList> {
		return unwrap<AiModelList>(
			await apiService.post<AiModelList>(`${BASE}/models`, { provider, apiKey: apiKey || undefined, refresh: refresh || undefined })
		);
	},

	/** `model` es el que respondió: si no es el guardado, el elegido estaba saturado y contestó el de respaldo. */
	async test(): Promise<{ ok: true; reply: string; model: string }> {
		return unwrap<{ ok: true; reply: string; model: string }>(
			await apiService.post<{ ok: true; reply: string; model: string }>(`${BASE}/config/test`, undefined, { timeout: CHAT_TIMEOUT })
		);
	},

	/** Solo la pregunta nueva: la conversación anterior la recuerda el backend. */
	async chat(message: string, context: AssistantContextItem[]): Promise<AssistantChatResponse> {
		return unwrap<AssistantChatResponse>(
			await apiService.post<AssistantChatResponse>(`${BASE}/chat`, { message, context }, { timeout: CHAT_TIMEOUT })
		);
	},

	async history(limit = 100): Promise<ChatMessage[]> {
		const data = unwrap<ChatMessage[]>(await apiService.get<ChatMessage[]>(`${BASE}/messages`, { params: { limit } }));
		return Array.isArray(data) ? data : [];
	},

	async memory(): Promise<AssistantMemoryStatus> {
		return unwrap<AssistantMemoryStatus>(await apiService.get<AssistantMemoryStatus>(`${BASE}/memory`));
	},

	async clearMemory(): Promise<void> {
		await apiService.delete(`${BASE}/memory`);
	},

	/** `/resume`: lo pendiente pasa al resumen de la memoria y la conversación se vacía. */
	async summarizeMemory(): Promise<{ summary: string; summarized: number }> {
		return unwrap<{ summary: string; summarized: number }>(
			await apiService.post<{ summary: string; summarized: number }>(`${BASE}/memory/summarize`, undefined, { timeout: CHAT_TIMEOUT })
		);
	},
};
