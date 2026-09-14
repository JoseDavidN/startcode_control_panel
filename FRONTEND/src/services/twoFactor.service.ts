import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	TwoFactorEnabledResponse,
	TwoFactorSetupResponse,
} from '@typings/auth.types';

class TwoFactorService {
	async setup(): Promise<TwoFactorSetupResponse> {
		const response = await apiService.post<TwoFactorSetupResponse>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_SETUP,
		);
		return response.data ?? response;
	}

	/** Devuelve los códigos de respaldo en claro: es la única vez que se ven. */
	async enable(code: string): Promise<TwoFactorEnabledResponse> {
		const response = await apiService.post<TwoFactorEnabledResponse>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_ENABLE,
			{ code },
		);
		return response.data ?? response;
	}

	/** Desactivar exige contraseña además del código. */
	async disable(code: string, password: string): Promise<{ message: string }> {
		const response = await apiService.post<{ message: string }>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_DISABLE,
			{ code, password },
		);
		return response.data ?? response;
	}

	async regenerateBackupCodes(
		code: string,
		password: string,
	): Promise<{ backupCodes: string[] }> {
		const response = await apiService.post<{ backupCodes: string[] }>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_BACKUP_CODES,
			{ code, password },
		);
		return response.data ?? response;
	}

	/** Segundo factor del login: código de la app o código de respaldo. */
	async verifyLogin(
		tempToken: string,
		payload: { code?: string; backupCode?: string },
	): Promise<any> {
		const response = await apiService.post<any>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_VERIFY_LOGIN,
			{ tempToken, ...payload },
		);
		return response.data ?? response;
	}
}

export const twoFactorService = new TwoFactorService();
