// src/providers/AuthProvider.tsx
import { useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '@contexts/AuthContext';
import { useLoginMutation, useLogoutMutation } from '@hooks/useAuthMutation';
import { useCurrentUser } from '@hooks/useAuthQuery';
import { queryClient } from '@lib/queryClient';
import { serverService } from '@services/server.service';
import { twoFactorService } from '@services/twoFactor.service';
import { normalizeAuthResponse } from '@services/auth.adapter';
import { TokenManager } from '@utils/tokenManager';
import { authApi } from '@services/auth.api';
import { saveTrustedDeviceToken } from '@lib/trustedDevice';
import type {
  AuthResponse,
  LoginCredentials,
  PasswordChangeRequiredResponse,
  Permission,
  TwoFactorPendingResponse,
  UserRole,
} from '@typings/auth.types';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Usar TanStack Query para obtener el usuario
  const { data: user, isLoading, refetch } = useCurrentUser();
  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();
  /* Cuenta del login a medio hacer: el token de confianza se guarda por email. */
  const pendingEmailRef = useRef<string | null>(null);

  // Login con TanStack Query
  const login = useCallback(
    async (
      credentials: LoginCredentials,
    ): Promise<TwoFactorPendingResponse | PasswordChangeRequiredResponse | void> => {
      try {
        const result = await loginMutation.mutateAsync(credentials);

        if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
          pendingEmailRef.current = credentials.email;
          return result;
        }

        /* La contraseña caducó: el backend no emite sesión hasta cambiarla. */
        if ('requiresPasswordChange' in result && result.requiresPasswordChange) {
          return result;
        }

        /* La respuesta del login ya trae el usuario: sembrarlo deja la sesión
           activa de inmediato, sin que `isAuthenticated` dependa del roundtrip
           a /auth/me. El refetch de abajo queda como confirmación. */
        queryClient.setQueryData(['currentUser'], (result as AuthResponse).user);

        await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        await refetch();
        await queryClient.prefetchQuery({
          queryKey: ['servers'],
          queryFn: () => serverService.getServers(),
        });
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    [loginMutation, refetch]
  );

  const complete2FALogin = useCallback(
    async (
      tempToken: string,
      payload: { code?: string; backupCode?: string },
    ): Promise<PasswordChangeRequiredResponse | void> => {
      const backendData = await twoFactorService.verifyLogin(tempToken, payload);

      /* Recordar este dispositivo 7 días, también si sigue la contraseña caducada. */
      const email = pendingEmailRef.current;
      if (email && typeof backendData?.trustedDeviceToken === 'string') {
        await saveTrustedDeviceToken(email, backendData.trustedDeviceToken);
      }

      /* Puede encadenar con la contraseña caducada: aún no hay sesión. */
      if (backendData?.requiresPasswordChange) {
        return backendData as PasswordChangeRequiredResponse;
      }

      const normalized = normalizeAuthResponse(backendData);

      if (normalized.tokens) {
        TokenManager.setTokens(
          normalized.tokens.accessToken,
          normalized.tokens.refreshToken || normalized.tokens.accessToken,
          normalized.rememberMe
        );
      }
      TokenManager.saveUserData(normalized.user);
      queryClient.setQueryData(['currentUser'], normalized.user);

      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      await refetch();
      await queryClient.prefetchQuery({
        queryKey: ['servers'],
        queryFn: () => serverService.getServers(),
      });
    },
    [refetch]
  );

  /** Cambio obligatorio por contraseña caducada: al terminar ya hay sesión. */
  const completeExpiredPasswordChange = useCallback(
    async (tempToken: string, currentPassword: string, newPassword: string): Promise<void> => {
      const backendData = await authApi.changeExpiredPassword(
        tempToken,
        currentPassword,
        newPassword,
      );
      const normalized = normalizeAuthResponse(backendData);

      if (normalized.tokens) {
        TokenManager.setTokens(
          normalized.tokens.accessToken,
          normalized.tokens.refreshToken || normalized.tokens.accessToken,
          normalized.rememberMe,
        );
      }
      TokenManager.saveUserData(normalized.user);
      queryClient.setQueryData(['currentUser'], normalized.user);

      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      await refetch();
    },
    [refetch]
  );

  // Logout con TanStack Query
  const logout = useCallback(
    async (): Promise<void> => {
      try {
        await logoutMutation.mutateAsync();
        // Invalidar y limpiar cache
        queryClient.clear();
      } catch (error) {
        console.error('Logout error:', error);
      }
    },
    [logoutMutation]
  );

  // Refrescar autenticación
  const refreshAuth = useCallback(
    async (): Promise<void> => {
      try {
        await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        await refetch();
      } catch (error) {
        console.error('Refresh auth error:', error);
        throw error;
      }
    },
    [refetch]
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!user || !user.permissions) return false;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const hasRole = useCallback(
    (role: UserRole): boolean => {
      if (!user || !user.roles) return false;
      return user.roles.includes(role);
    },
    [user]
  );

  const hasAnyRole = useCallback(
    (roles: UserRole[]): boolean => {
      if (!user || !user.roles) return false;
      return roles.some((role) => user.roles!.includes(role));
    },
    [user]
  );

  /* Memoizado: un objeto nuevo en cada render re-renderizaba a todos los
     consumidores de useAuth (layout, sockets, guardas) sin que nada cambiara. */
  const isBusy = isLoading || loginMutation.isPending || logoutMutation.isPending;
  const value = useMemo(() => ({
    user: user || null,
    isAuthenticated: !!user,
    isLoading: isBusy,
    login,
    complete2FALogin,
    completeExpiredPasswordChange,
    logout,
    refreshAuth,
    hasPermission,
    hasRole,
    hasAnyRole,
  }), [user, isBusy, login, complete2FALogin, completeExpiredPasswordChange, logout, refreshAuth,
    hasPermission, hasRole, hasAnyRole]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

