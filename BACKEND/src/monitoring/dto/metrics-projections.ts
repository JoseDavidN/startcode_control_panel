import type { AgentMetrics } from '../entities/agent-metrics.entity';

export const DASHBOARD_PROJECTION: (keyof AgentMetrics)[] = [
  'server_id',
  'timestamp',
  'cpu_usage',
  'memory_usage_percent',
  'disk_filesystems',
  'network_connections_active',
];

export const SYSTEM_INFO_PROJECTION: (keyof AgentMetrics)[] = [
  'server_id',
  'timestamp',
  'system_hostname',
  'system_platform',
  'system_distro',
  'system_kernel',
  'system_arch',
  'system_uptime',
  'system_boot_time',
  'network_public_ip',
  'network_private_ips',
  'agent_version',
];

export const AGENT_STATUS_PROJECTION: (keyof AgentMetrics)[] = [
  'server_id',
  'timestamp',
  'agent_version',
];
