// src/providers/AppProviders.tsx
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { AuthProvider } from './AuthProvider';
import { RealtimeMetricsProvider } from '@contexts/RealtimeMetricsContext';
import { NotificationProvider } from '@contexts/NotificationContext';
import { PreferencesProvider } from '@contexts/PreferencesContext';
import { UpdaterProvider } from '@contexts/UpdaterContext';
import { AssistantProvider } from '@contexts/AssistantContext';
import { ContextMenuProvider } from '@contexts/ContextMenuContext';
import { PreferencesSync } from '@components/PreferencesSync';
import { queryClient } from '@lib/queryClient';
import { API_CONFIG } from '@utils/constants';
import { useAuth } from '@hooks/useAuth';
import { useInactivityLogout } from '@hooks/useInactivityLogout';
import { useSecuritySettings } from '@hooks/useSecuritySettings';
import { TokenManager } from '@utils/tokenManager';

/* Monta el watcher de inactividad una vez dentro del AuthProvider.
   Las sesiones con "Mantener sesión iniciada" no se cierran por inactividad. */
const InactivityWatcher = () => {
  const { logout, isAuthenticated } = useAuth();
  const { settings } = useSecuritySettings();
  const handleLogout = useCallback(() => { if (isAuthenticated) void logout(); }, [isAuthenticated, logout]);
  const timeout = isAuthenticated && !TokenManager.isPersistent() ? settings.sessionTimeout : 0;
  useInactivityLogout(timeout, handleLogout);
  return null;
};

interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps) => {
  const backendUrl = API_CONFIG.WS_URL;

  return (
    <QueryClientProvider client={queryClient}>
      <ContextMenuProvider>
      <PreferencesProvider>
        <AuthProvider>
          <PreferencesSync />
          <InactivityWatcher />
          <RealtimeMetricsProvider backendUrl={backendUrl}>
            <NotificationProvider>
              <UpdaterProvider>
                <AssistantProvider>
                  {children}
                </AssistantProvider>
              </UpdaterProvider>
            </NotificationProvider>
          </RealtimeMetricsProvider>
        </AuthProvider>
      </PreferencesProvider>
      </ContextMenuProvider>
      <Toaster
        position="bottom-center"
        expand
        richColors
        className="toaster-themed"
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};
