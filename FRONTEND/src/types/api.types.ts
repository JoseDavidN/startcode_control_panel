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
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}
