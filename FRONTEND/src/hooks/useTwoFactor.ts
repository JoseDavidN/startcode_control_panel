import { useMutation, useQueryClient } from '@tanstack/react-query';
import { twoFactorService } from '@services/twoFactor.service';
import type {
	TwoFactorEnabledResponse,
	TwoFactorSetupResponse,
} from '@typings/auth.types';

/** Tras activar o desactivar, el perfil cacheado queda obsoleto: se invalida. */
function useAuthInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: ['currentUser'] });
		void queryClient.invalidateQueries({ queryKey: ['sessions'] });
	};
}

export function useTwoFactorSetup() {
	return useMutation<TwoFactorSetupResponse, Error>({
		mutationFn: () => twoFactorService.setup(),
	});
}

export function useTwoFactorEnable() {
	const invalidate = useAuthInvalidation();

	return useMutation<TwoFactorEnabledResponse, Error, string>({
		mutationFn: (code: string) => twoFactorService.enable(code),
		onSuccess: invalidate,
	});
}

export function useTwoFactorDisable() {
	const invalidate = useAuthInvalidation();

	return useMutation<{ message: string }, Error, { code: string; password: string }>({
		mutationFn: ({ code, password }) => twoFactorService.disable(code, password),
		onSuccess: invalidate,
	});
}

export function useRegenerateBackupCodes() {
	const invalidate = useAuthInvalidation();

	return useMutation<{ backupCodes: string[] }, Error, { code: string; password: string }>({
		mutationFn: ({ code, password }) => twoFactorService.regenerateBackupCodes(code, password),
		onSuccess: invalidate,
	});
}
