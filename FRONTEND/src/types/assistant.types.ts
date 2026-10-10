// src/types/assistant.types.ts

/** Proveedores admitidos: el backend rechaza cualquier otro. */
export type AiProvider = 'anthropic' | 'openai' | 'gemini';

/* Sin lista fija de modelos: se piden al proveedor (`POST /assistant/models`).
   `preferred` solo decide cuál queda elegido si está entre los disponibles. */
export const AI_PROVIDERS: { id: AiProvider; name: string; vendor: string; keyHint: string; keyUrl: string; preferred: string }[] = [
	{
		id: 'anthropic', name: 'Claude', vendor: 'Anthropic', keyHint: 'sk-ant-…',
		keyUrl: 'https://console.anthropic.com/settings/keys',
		preferred: 'claude-opus-5-5',
	},
	{
		id: 'openai', name: 'ChatGPT', vendor: 'OpenAI', keyHint: 'sk-…',
		keyUrl: 'https://platform.openai.com/api-keys',
		preferred: 'gpt-5',
	},
	{
		id: 'gemini', name: 'Gemini', vendor: 'Google', keyHint: 'AIza…',
		keyUrl: 'https://aistudio.google.com/apikey',
		preferred: 'gemini-flash-latest',
	},
];

export interface AssistantConfig {
	provider: AiProvider;
	model: string;
	/** Últimos 4 caracteres de la clave guardada. La clave nunca vuelve del servidor. */
	apiKeyHint: string;
	enabled: boolean;
	updatedAt: string;
}

export interface AssistantConfigForm {
	provider: AiProvider;
	model: string;
	/** Vacía conserva la guardada (mismo proveedor). */
	apiKey?: string;
	enabled?: boolean;
}

/** Modelo que el proveedor ofrece ahora mismo para esa clave. */
export interface AiModel {
	id: string;
	name: string;
}

export interface AiModelList {
	models: AiModel[];
	fetchedAt: string;
}

export type ChatRole = 'user' | 'assistant';

/** Mensaje guardado en la memoria del asistente (backend). */
export interface ChatMessage {
	id: string;
	role: ChatRole;
	content: string;
	/** Quién escribió la respuesta; null en las preguntas. */
	provider: AiProvider | null;
	model: string | null;
	createdAt: string;
}

/** Lo que recuerda el asistente, sea cual sea el proveedor. */
export interface AssistantMemoryStatus {
	/** Resumen a largo plazo de la conversación antigua (vacío al principio). */
	summary: string;
	messageCount: number;
	updatedAt: string | null;
}

/** Lo que una pantalla puede ofrecer al asistente para leer. */
export type AssistantSourceType = 'terminal' | 'command_output' | 'sql_editor' | 'sql_result' | 'schema' | 'page';

export interface AssistantContextItem {
	type: AssistantSourceType;
	title: string;
	content: string;
}

export interface AssistantChatResponse {
	question: ChatMessage;
	answer: ChatMessage;
}

/** Dónde se puede pegar un bloque de la respuesta. Pegar nunca ejecuta. */
export type AssistantTargetKind = 'terminal' | 'command' | 'sql';
