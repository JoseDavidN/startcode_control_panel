export type SidebarMode = 'expanded' | 'collapsed';
export type ServersView = 'cards' | 'list';

export interface AppearancePrefs {
  sidebarMode: SidebarMode;
  reducedMotion: boolean;
  serversView: ServersView;
}

export interface NotificationPrefs {
  serverOffline: boolean;
  highCpuUsage: boolean;
  highMemoryUsage: boolean;
  highDiskUsage: boolean;
  securityAlerts: boolean;
  weeklyReport: boolean;
  productNews: boolean;
}

export interface SecurityPrefs {
  sessionTimeout: number;      // minutos, 0 = nunca
  passwordExpiration: number;  // días, 0 = nunca
}

export interface MonitoringPrefs {
  refreshInterval: number;   // segundos
  cpuThreshold: number;      // %
  memoryThreshold: number;   // %
  diskThreshold: number;     // %
  retentionDays: number;
}

export interface UserPreferences {
  appearance: AppearancePrefs;
  notifications: NotificationPrefs;
  security: SecurityPrefs;
  monitoring: MonitoringPrefs;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  appearance: { sidebarMode: 'expanded', reducedMotion: false, serversView: 'cards' },
  notifications: {
    serverOffline: true,
    highCpuUsage: true,
    highMemoryUsage: true,
    highDiskUsage: false,
    securityAlerts: true,
    weeklyReport: true,
    productNews: false,
  },
  security: { sessionTimeout: 30, passwordExpiration: 90 },
  monitoring: {
    refreshInterval: 30,
    cpuThreshold: 80,
    memoryThreshold: 85,
    diskThreshold: 90,
    retentionDays: 30,
  },
};


/**
 * Elimina las claves con valor `undefined`. class-transformer materializa los
 * campos opcionales del DTO como propiedades propias con valor undefined, y al
 * hacer spread pisarían el valor guardado (y JSON.stringify las descartaría,
 * dejando la sección incompleta en la base de datos).
 */
function defined<T extends object>(source: T | undefined | null): Partial<T> {
  if (!source) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Merge por sección: lo que no se envía no se pisa.
 * Solo hay dos niveles, así que no hace falta un deep-merge genérico.
 */
export function mergePreferences(
  current: Partial<UserPreferences> | null | undefined,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const base = current ?? {};
  return {
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...defined(base.appearance), ...defined(patch.appearance) },
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...defined(base.notifications), ...defined(patch.notifications) },
    security: { ...DEFAULT_PREFERENCES.security, ...defined(base.security), ...defined(patch.security) },
    monitoring: { ...DEFAULT_PREFERENCES.monitoring, ...defined(base.monitoring), ...defined(patch.monitoring) },
  };
}
