import React from 'react';
import {
  Cpu,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MemoryStick,
  Monitor,
  Database,
  Globe,
  ChevronRight,
  Wrench,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';
import { type ServerData } from '@typings/DashboardTypes';
import { useServerMetrics } from '@contexts/RealtimeMetricsContext';

interface ServerCardProps {
  server: ServerData;
  onClick: (server: ServerData) => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({ server, onClick }) => {
  // Obtener métricas en tiempo real del contexto
  const realtimeData = useServerMetrics(server.id);

  // Usar métricas en tiempo real si están disponibles, sino usar las del servidor
  const currentMetrics = {
    cpu: Number(realtimeData.metrics?.cpu ?? server.cpu ?? 0),
    memory: Number(realtimeData.metrics?.memory ?? server.memory ?? 0),
    disk: Number(realtimeData.metrics?.disk ?? server.disk ?? 0),
    services_count: Number(realtimeData.servicesCount),
    uptime: realtimeData.metrics?.uptime ?? server.uptime ?? 0,
  };

  // Datos en tiempo real del agente
  // Priorizar los datos de WebSocket (servicesCount y services array)
  const servicesCount = realtimeData.servicesCount
    ?? realtimeData.services?.length
    ?? server.activeServices
    ?? server.services?.length
    ?? 0;

  const websitesCount = realtimeData.websites?.length ?? server.websites?.length ?? 0;
  const databasesCount = realtimeData.databases?.length ?? server.databases?.length ?? 0;

  // Servicios importantes priorizados (servidores web, VPN, seguridad, bases de datos)
  const getImportantServices = () => {
    const allServices = realtimeData.services ?? server.services ?? [];

    // Filtrar servicios activos (más flexible con los estados)
    const activeServices = allServices.filter(s => {
      const state = ((s as any).state || (s as any).status || '').toLowerCase();
      const subState = ((s as any).subState || '').toLowerCase();
      return state === 'active' || state === 'running' || subState === 'running';
    });

    // Prioridad de servicios importantes
    const priorities = {
      high: ['nginx', 'apache', 'httpd', 'openvpn', 'wireguard', 'fail2ban', 'ufw', 'iptables', 'firewalld'],
      medium: ['mysql', 'postgresql', 'mariadb', 'mongodb', 'redis', 'docker', 'ssh', 'sshd'],
      low: ['php-fpm', 'nodejs', 'node', 'npm', 'pm2']
    };

    const categorized = {
      high: [] as any[],
      medium: [] as any[],
      low: [] as any[],
      other: [] as any[]
    };

    activeServices.forEach(service => {
      const serviceName = (service.name || '').toLowerCase();
      if (priorities.high.some(p => serviceName.includes(p))) {
        categorized.high.push(service);
      } else if (priorities.medium.some(p => serviceName.includes(p))) {
        categorized.medium.push(service);
      } else if (priorities.low.some(p => serviceName.includes(p))) {
        categorized.low.push(service);
      } else {
        categorized.other.push(service);
      }
    });

    // Retornar máximo 5 servicios priorizados
    return [
      ...categorized.high,
      ...categorized.medium,
      ...categorized.low,
      ...categorized.other
    ].slice(0, 5);
  };

  const importantServices = getImportantServices();

  // Determinar el estado actual del servidor
  const currentStatus = realtimeData.status !== 'unknown' ? realtimeData.status : server.status;

  /**
   * Función para formatear uptime
   * Acepta tanto string como número (segundos)
   */
  const formatUptime = (uptime: string | number | undefined): string => {
    if (!uptime || uptime === 'N/A') return 'N/A';

    let weeks = 0, days = 0, hours = 0, minutes = 0;

    // Si es un número, convertir de segundos
    if (typeof uptime === 'number') {
      const totalMinutes = Math.floor(uptime / 60);
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);

      weeks = Math.floor(totalDays / 7);
      days = totalDays % 7;
      hours = totalHours % 24;
      minutes = totalMinutes % 60;
    }
    // Si es un string, parsear
    else if (typeof uptime === 'string') {
      const parts = uptime.split(', ');
      parts.forEach(part => {
        if (part.includes('week')) weeks = parseInt(part.match(/\d+/)?.[0] || '0');
        else if (part.includes('day')) days = parseInt(part.match(/\d+/)?.[0] || '0');
        else if (part.includes('hour')) hours = parseInt(part.match(/\d+/)?.[0] || '0');
        else if (part.includes('minute')) minutes = parseInt(part.match(/\d+/)?.[0] || '0');
      });

      if (days >= 7) {
        weeks += Math.floor(days / 7);
        days = days % 7;
      }
    }

    if (weeks > 0) {
      return `${weeks}w ${days}d ${hours}h ${minutes}m`;
    }
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <XCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getServiceIcon = (service: any) => {
    const name = (service.name || service.type || '').toLowerCase();

    // Web servers
    if (name.includes('nginx') || name.includes('apache') || name.includes('httpd')) {
      return <Globe className="w-4 h-4" />;
    }
    // Databases
    if (name.includes('mysql') || name.includes('postgres') ||
        name.includes('mongo') || name.includes('redis') ||
        name.includes('mariadb')) {
      return <Database className="w-4 h-4" />;
    }
    // VPN / Network
    if (name.includes('openvpn') || name.includes('wireguard')) {
      return <Wifi className="w-4 h-4" />;
    }
    // Security
    if (name.includes('fail2ban') || name.includes('ufw') || name.includes('iptables')) {
      return <AlertTriangle className="w-4 h-4" />;
    }
    // SSH
    if (name.includes('ssh')) {
      return <Monitor className="w-4 h-4" />;
    }
    // Default
    return <Wrench className="w-4 h-4" />;
  };

  return (
    <div
      onClick={() => onClick(server)}
      className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-white/10 cursor-pointer transition-all duration-300 group"
    >
      {/* Server Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-linear-to-br from-purple-500/20 to-blue-500/20 border border-purple-400/30 group-hover:border-purple-400/50 transition-all duration-300">
            <Monitor className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              {server.name}
              {realtimeData.connected && (
                <span title="Conectado en tiempo real">
                  <Wifi className="w-4 h-4 text-green-400 animate-pulse" />
                </span>
              )}
              {!realtimeData.connected && currentStatus === 'offline' && (
                <span title="Sin conexión en tiempo real">
                  <WifiOff className="w-4 h-4 text-gray-400" />
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400">{server.ip} • {server.os}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon(currentStatus)}
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors duration-300" />
        </div>
      </div>

      {/* Top 3 Métricas Principales con Iconos */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* CPU */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`p-3 rounded-xl bg-linear-to-br ${
            currentMetrics.cpu >= 80 ? 'from-red-500/20 to-red-600/10 border-red-400/30' :
            currentMetrics.cpu >= 60 ? 'from-yellow-500/20 to-yellow-600/10 border-yellow-400/30' :
            'from-green-500/20 to-green-600/10 border-green-400/30'
          } border transition-all duration-300`}>
            <Cpu className={`w-6 h-6 ${
              currentMetrics.cpu >= 80 ? 'text-red-400' :
              currentMetrics.cpu >= 60 ? 'text-yellow-400' :
              'text-green-400'
            }`} />
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium">CPU</p>
            <p className="text-lg font-bold text-white">{currentMetrics.cpu.toFixed(1)}%</p>
          </div>
        </div>

        {/* Memoria */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`p-3 rounded-xl bg-linear-to-br ${
            currentMetrics.memory >= 80 ? 'from-red-500/20 to-red-600/10 border-red-400/30' :
            currentMetrics.memory >= 60 ? 'from-yellow-500/20 to-yellow-600/10 border-yellow-400/30' :
            'from-blue-500/20 to-blue-600/10 border-blue-400/30'
          } border transition-all duration-300`}>
            <MemoryStick className={`w-6 h-6 ${
              currentMetrics.memory >= 80 ? 'text-red-400' :
              currentMetrics.memory >= 60 ? 'text-yellow-400' :
              'text-blue-400'
            }`} />
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium">RAM</p>
            <p className="text-lg font-bold text-white">{currentMetrics.memory.toFixed(1)}%</p>
          </div>
        </div>

        {/* Disco */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`p-3 rounded-xl bg-linear-to-br ${
            currentMetrics.disk >= 80 ? 'from-red-500/20 to-red-600/10 border-red-400/30' :
            currentMetrics.disk >= 60 ? 'from-yellow-500/20 to-yellow-600/10 border-yellow-400/30' :
            'from-purple-500/20 to-purple-600/10 border-purple-400/30'
          } border transition-all duration-300`}>
            <HardDrive className={`w-6 h-6 ${
              currentMetrics.disk >= 80 ? 'text-red-400' :
              currentMetrics.disk >= 60 ? 'text-yellow-400' :
              'text-purple-400'
            }`} />
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium">Disco</p>
            <p className="text-lg font-bold text-white">{currentMetrics.disk.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Servicios, Sitios Web, Bases de Datos */}
      <div className="grid grid-cols-3 gap-3 mb-5 pb-5 border-b border-white/10">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Wrench className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xs text-gray-400 mb-1">Servicios</p>
          <p className="text-lg font-bold text-white">{servicesCount}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xs text-gray-400 mb-1">Sitios Web</p>
          <p className="text-lg font-bold text-white">{websitesCount}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Database className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-xs text-gray-400 mb-1">Bases de Datos</p>
          <p className="text-lg font-bold text-white">{databasesCount}</p>
        </div>
      </div>

      {/* Servicios Importantes */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">Servicios clave:</span>
          <div className="flex items-center space-x-1">
            {importantServices.length > 0 ? (
              <>
                {importantServices.map((service, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300"
                    title={service.name || (service as any).displayName || 'Servicio'}
                  >
                    {getServiceIcon(service)}
                  </div>
                ))}
                {servicesCount > 5 && (
                  <div className="px-2 py-1 rounded-lg bg-purple-500/20 border border-purple-400/30 text-xs text-purple-300 font-semibold">
                    +{servicesCount - 5}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-500">Sin datos</span>
            )}
          </div>
        </div>
      </div>

      {/* Tiempo Activo */}
      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-400">Tiempo activo</span>
        </div>
        <p className="text-sm text-white font-mono font-semibold">{formatUptime(currentMetrics.uptime)}</p>
      </div>
    </div>
  );
};

