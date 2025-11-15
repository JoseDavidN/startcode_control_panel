// src/providers/AuthProvider.tsx
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useLoginMutation, useLogoutMutation } from '../hooks/useAuthMutation';
import { useCurrentUser } from '../hooks/useAuthQuery';
import { queryClient } from '../lib/queryClient';
import { serverService } from '../services/server.service';
import type {
  LoginCredentials,
  Permission,
  UserRole,
} from '../types/auth.types';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Usar TanStack Query para obtener el usuario
  const { data: user, isLoading, refetch } = useCurrentUser();
  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();

  // Login con TanStack Query
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      try {
        await loginMutation.mutateAsync(credentials);
        // Invalidar y refrescar el query del usuario
        await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        await refetch();
        // Prefetch de servidores para tener estadísticas inmediatamente
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

  const value = {
    user: user || null,
    isAuthenticated: !!user,
    isLoading: isLoading || loginMutation.isPending || logoutMutation.isPending,
    login,
    logout,
    refreshAuth,
    hasPermission,
    hasRole,
    hasAnyRole,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

