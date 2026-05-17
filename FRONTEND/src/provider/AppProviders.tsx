// src/providers/AppProviders.tsx
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { AuthProvider } from './AuthProvider';
import { RealtimeMetricsProvider } from '@contexts/RealtimeMetricsContext';
import { NotificationProvider } from '@contexts/NotificationContext';
import { queryClient } from '@lib/queryClient';

interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps) => {
  // La URL del WebSocket debe ser sin /api/v1
  // Si VITE_API_URL es http://localhost:3001/api/v1, extraemos solo http://localhost:3001
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
  const backendUrl = apiUrl.replace('/api/v1', '');

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeMetricsProvider backendUrl={backendUrl}>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </RealtimeMetricsProvider>
      </AuthProvider>
      <Toaster
        position="bottom-right"
        expand
        richColors
        toastOptions={{
          style: {
            background: 'rgba(8,3,20,0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(28px)',
            color: '#f4f1ff',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};

