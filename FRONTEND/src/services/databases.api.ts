// src/services/databases.api.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import { TokenManager } from '@utils/tokenManager';
import type {
	DatabaseConnection,
	DatabaseConnectionForm,
	DatabaseQueryAuditEntry,
	DatabaseSchema,
	DatabaseTestResult,
	QueryResult,
	SchemaSection,
	SchemaSections,
} from '@typings/database.types';

/** El backend responde el objeto directo; axios lo envuelve en `data`. */
function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

const BASE = API_CONFIG.ENDPOINTS.DATABASES;

export const databasesApi = {
	async list(): Promise<DatabaseConnection[]> {
		const data = unwrap<DatabaseConnection[]>(await apiService.get<DatabaseConnection[]>(BASE));
		return Array.isArray(data) ? data : [];
	},

	async get(id: string): Promise<DatabaseConnection> {
		return unwrap<DatabaseConnection>(await apiService.get<DatabaseConnection>(`${BASE}/${id}`));
	},

	/* ── Vista de consultas ─────────────────────────────────────────────
	   Al entrar se abre una sesión (una conexión en el backend) y todas las
	   llamadas del árbol y el editor la reutilizan con su `sessionId`. */

	async openSession(id: string): Promise<{ sessionId: string; version: string | null }> {
		return unwrap<{ sessionId: string; version: string | null }>(
			await apiService.post<{ sessionId: string; version: string | null }>(`${BASE}/${id}/sessions`)
		);
	},

	/**
	 * Cierra la sesión. Con `keepalive` la petición sale aunque la ventana se
	 * esté cerrando (al recargar o cerrar la app no hay desmontaje de React).
	 */
	closeSession(id: string, sessionId: string): void {
		const token = TokenManager.getAccessToken();
		void fetch(`${API_CONFIG.BASE_URL}${BASE}/${id}/sessions/${sessionId}`, {
			method: 'DELETE',
			keepalive: true,
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		}).catch(() => undefined);
	},

	async schemas(id: string, sessionId: string): Promise<DatabaseSchema[]> {
		const data = unwrap<DatabaseSchema[]>(
			await apiService.get<DatabaseSchema[]>(`${BASE}/${id}/schemas?session=${sessionId}`)
		);
		return Array.isArray(data) ? data : [];
	},

	/** Una sección de una base: tablas, vistas, triggers, índices o procedimientos. */
	async section<S extends SchemaSection>(id: string, schema: string, section: S, sessionId: string): Promise<SchemaSections[S]> {
		const data = unwrap<SchemaSections[S]>(
			await apiService.get<SchemaSections[S]>(
				`${BASE}/${id}/schemas/${encodeURIComponent(schema)}/${section}?session=${sessionId}`
			)
		);
		return (Array.isArray(data) ? data : []) as SchemaSections[S];
	},

	/** Una sentencia peligrosa responde 400 `DANGEROUS_QUERY` hasta que llega con `confirm`. */
	async query(id: string, sessionId: string, sql: string, schema?: string | null, confirm = false): Promise<QueryResult> {
		return unwrap<QueryResult>(
			await apiService.post<QueryResult>(`${BASE}/${id}/query`, {
				sessionId,
				sql,
				...(schema ? { schema } : {}),
				...(confirm ? { confirm: true } : {}),
			})
		);
	},

	/** UPDATE de una fila del resultado por su clave primaria completa. */
	async updateRow(
		id: string,
		sessionId: string,
		input: {
			schema: string;
			namespace?: string;
			table: string;
			key: Record<string, unknown>;
			changes: Record<string, unknown>;
		},
	): Promise<{ affectedRows: number }> {
		return unwrap<{ affectedRows: number }>(
			await apiService.post<{ affectedRows: number }>(`${BASE}/${id}/rows/update`, { ...input, sessionId })
		);
	},

	async audit(id: string): Promise<DatabaseQueryAuditEntry[]> {
		const data = unwrap<DatabaseQueryAuditEntry[]>(
			await apiService.get<DatabaseQueryAuditEntry[]>(`${BASE}/${id}/audit`)
		);
		return Array.isArray(data) ? data : [];
	},

	async create(form: DatabaseConnectionForm): Promise<DatabaseConnection> {
		return unwrap<DatabaseConnection>(await apiService.post<DatabaseConnection>(BASE, form));
	},

	async update(id: string, form: DatabaseConnectionForm): Promise<DatabaseConnection> {
		return unwrap<DatabaseConnection>(await apiService.patch<DatabaseConnection>(`${BASE}/${id}`, form));
	},

	async remove(id: string): Promise<void> {
		await apiService.delete(`${BASE}/${id}`);
	},

	/** Contraseña en claro: solo la pide el campo de contraseña del formulario. */
	async revealPassword(id: string): Promise<string> {
		const data = unwrap<{ password: string }>(await apiService.get<{ password: string }>(`${BASE}/${id}/password`));
		return data?.password ?? '';
	},


	/** Bases que ve el usuario con datos sin guardar (selector del formulario). */
	async previewDatabases(form: Omit<DatabaseConnectionForm, 'name' | 'tag'> & { connectionId?: string }): Promise<DatabaseSchema[]> {
		const data = unwrap<DatabaseSchema[]>(await apiService.post<DatabaseSchema[]>(`${BASE}/schemas`, form));
		return Array.isArray(data) ? data : [];
	},

	/** Prueba datos sin guardarlos; con `connectionId` y sin `password` usa la guardada. */
	async test(form: Omit<DatabaseConnectionForm, 'name' | 'tag'> & { connectionId?: string }): Promise<DatabaseTestResult> {
		return unwrap<DatabaseTestResult>(await apiService.post<DatabaseTestResult>(`${BASE}/test`, form));
	},
};
