import { useMutation } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { API_CONFIG } from '@utils/constants';
import { queryClient } from '@lib/queryClient';

export interface UpdateProfilePayload {
  firstname: string;
  lastname: string;
  email: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) =>
      apiService.patch(API_CONFIG.ENDPOINTS.UPDATE_PROFILE, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) =>
      apiService.post(API_CONFIG.ENDPOINTS.CHANGE_PASSWORD, data),
  });
}
