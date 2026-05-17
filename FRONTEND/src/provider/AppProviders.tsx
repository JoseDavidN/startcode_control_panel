// src/providers/AppProviders.tsx
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './AuthProvider';
import { RealtimeMetricsProvider } from '@contexts/RealtimeMetricsContext';
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
          {children}
        </RealtimeMetricsProvider>
      </AuthProvider>
      {/* React Query Devtools - solo en desarrollo */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};

