import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type { TwoFactorSetupResponse } from '@typings/auth.types';

class TwoFactorService {
	async setup(): Promise<TwoFactorSetupResponse> {
		const response = await apiService.post<TwoFactorSetupResponse>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_SETUP,
		);
		return response.data ?? response;
	}

	async enable(code: string): Promise<{ message: string }> {
		const response = await apiService.post<{ message: string }>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_ENABLE,
			{ code },
		);
		return response.data ?? response;
	}

	async disable(code: string): Promise<{ message: string }> {
		const response = await apiService.post<{ message: string }>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_DISABLE,
			{ code },
		);
		return response.data ?? response;
	}

	async verifyLogin(tempToken: string, code: string): Promise<any> {
		const response = await apiService.post<any>(
			API_CONFIG.ENDPOINTS.TWO_FACTOR_VERIFY_LOGIN,
			{ tempToken, code },
		);
		return response.data ?? response;
	}
}

export const twoFactorService = new TwoFactorService();
