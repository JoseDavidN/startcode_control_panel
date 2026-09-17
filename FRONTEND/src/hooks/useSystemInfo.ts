import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { API_CONFIG } from '@utils/constants';
import { IS_TAURI } from '@lib/tauriStore';

export interface SystemHealth {
  status: 'ok';
  version: string;
  environment: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected';
    pingMs: number | null;
    host: string;
    port: number;
    name: string;
    engine: string;
  };
  api: {
    url: string;
    port: number;
  };
}

export function useSystemInfo() {
  const [appVersion, setAppVersion] = useState<string>('—');

  useEffect(() => {
    if (IS_TAURI) {
      import('@tauri-apps/api/app')
        .then((m) => m.getVersion())
        .then(setAppVersion)
        .catch(() => setAppVersion('dev'));
    } else {
      setAppVersion(import.meta.env.VITE_APP_VERSION ?? 'dev');
    }
  }, []);

  const query = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    /* El backend responde el payload plano, no el sobre { success, data } que
       declara ApiService: el cast alinea el tipo con lo que llega de verdad. */
    queryFn: () =>
      apiService.get(API_CONFIG.ENDPOINTS.HEALTH) as unknown as Promise<SystemHealth>,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  return { ...query, appVersion };
}
