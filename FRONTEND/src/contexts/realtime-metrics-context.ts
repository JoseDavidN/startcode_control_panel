import { createContext } from 'react';
import type { Socket } from 'socket.io-client';

/* Tipos, store y contexto de las métricas en tiempo real, aparte del
   proveedor (RealtimeMetricsContext.tsx) para que ese archivo solo exporte
   componentes. Los hooks viven en @hooks/useRealtimeMetrics. */

// Tipos para las métricas en tiempo real
export interface ServerMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
}

export interface ProcessInfo {
  total: number;
  running: number;
  sleeping: number;
  stopped: number;
  zombie: number;
  list?: any[];
  topList?: any[];
}

export interface ServiceInfo {
  name: string;
  /** Igual que en el agente: active | inactive | failed | unknown */
  state: string;
  pid?: number;
  uptime?: number;
  memory?: number;
  cpu?: number;
}

export interface WebsiteInfo {
  domain: string;
  port: number;
  ssl: boolean;
  configPath?: string;
  certExpiry?: number;
}

export interface DatabaseInfo {
  type: string;
  version: string;
  databases: string[];
  size: number;
  running: boolean;
}

export interface RealtimeServerData {
  metrics?: ServerMetrics;
  status: 'online' | 'offline' | 'unknown';
  timestamp?: Date;
  serverName?: string;
  servicesCount?: number;
  processesCount?: number;
  /** null cuando el evento de procesos llega vacío. */
  processes?: ProcessInfo | null;
  services?: ServiceInfo[];
  websites?: WebsiteInfo[];
  databases?: DatabaseInfo[];
  connected?: boolean;
}

export interface RealtimeData {
  [serverId: string]: RealtimeServerData;
}

/**
 * Los datos viven fuera del estado de React: con `useState` cada evento del
 * socket re-renderizaba a todos los consumidores, aunque fuese de otro
 * servidor. Con un store externo cada uno se suscribe a lo que lee
 * (`useServerMetrics` solo a su servidor) vía `useSyncExternalStore`.
 */
export class RealtimeStore {
  private data: RealtimeData = {};
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = (): RealtimeData => this.data;

  update(fn: (prev: RealtimeData) => RealtimeData): void {
    this.data = fn(this.data);
    this.listeners.forEach(listener => listener());
  }
}

// Contexto: solo cambia al conectar/desconectar, no con cada evento.
export interface RealtimeMetricsContextType {
  store: RealtimeStore;
  connected: boolean;
  socket: Socket | null;
}

export const RealtimeMetricsContext = createContext<RealtimeMetricsContextType | undefined>(undefined);

/* Cuerpos de los eventos del gateway `/agent`, tal y como los emite el backend. */
export interface MetricsRealtimePayload {
  serverId: string;
  serverName?: string;
  timestamp: string | number;
  metrics: ServerMetrics;
}

export interface AgentConnectedPayload {
  serverId: string;
  serverName: string;
}

export interface AgentDisconnectedPayload {
  serverId: string;
}

export interface ServicesUpdatedPayload {
  serverId: string;
  services?: ServiceInfo[];
}

export interface ProcessesUpdatedPayload {
  serverId: string;
  processes?: ProcessInfo | null;
}

export interface WebsitesUpdatedPayload {
  serverId: string;
  websites?: WebsiteInfo[];
}

export interface DatabasesUpdatedPayload {
  serverId: string;
  databases?: DatabaseInfo[];
}
