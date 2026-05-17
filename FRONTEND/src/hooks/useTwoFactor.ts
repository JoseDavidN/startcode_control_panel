import { useMutation } from '@tanstack/react-query';
import { twoFactorService } from '@services/twoFactor.service';
import type { TwoFactorSetupResponse } from '@typings/auth.types';

export function useTwoFactorSetup() {
	return useMutation<TwoFactorSetupResponse, Error>({
		mutationFn: () => twoFactorService.setup(),
	});
}

export function useTwoFactorEnable() {
	return useMutation<{ message: string }, Error, string>({
		mutationFn: (code: string) => twoFactorService.enable(code),
	});
}

export function useTwoFactorDisable() {
	return useMutation<{ message: string }, Error, string>({
		mutationFn: (code: string) => twoFactorService.disable(code),
	});
}
