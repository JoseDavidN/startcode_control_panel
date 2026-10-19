// src/types/api.types.ts
export interface ApiResponse<T = any> {
	success: boolean;
	data: T;
	message?: string;
	errors?: Record<string, string[]>;
}

export interface ApiError {
	message: string;
	statusCode: number;
	errors?: Record<string, string[]>;
	/** Código de negocio del backend (p. ej. `SUDO_REQUIRED`), si lo manda. */
	code?: string;
	/** Indicación accionable que acompaña al error, si la hay. */
	hint?: string;
}

/**
 * Lo que puede llegar al `catch` de una llamada a la API: el `ApiError` del
 * cliente o, en llamadas que no pasan por él, el error crudo de axios.
 */
export interface RequestFailure {
	message?: string;
	response?: { data?: { message?: string } };
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}
