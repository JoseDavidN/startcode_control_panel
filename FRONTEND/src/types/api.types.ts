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

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}
