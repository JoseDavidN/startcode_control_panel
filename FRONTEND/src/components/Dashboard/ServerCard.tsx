import React from 'react';
import {
  Cpu,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Monitor,
  Database,
  Globe,
  ChevronRight,
  Package,
  Code,
  Terminal,
  Container
} from 'lucide-react';
import { type ServerData } from '../../types/DashboardTypes';

interface ServerCardProps {
  server: ServerData;
  onClick: (server: ServerData) => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({ server, onClick }) => {

  // Función para formatear uptime de "3 days, 6 hours, 57 minutes" a "3d:6H:57m" o "2w:3d:6H:57m" si hay semanas
  const formatUptime = (uptime: string | undefined): string => {
    if (!uptime || uptime === 'N/A') return 'N/A';

    const parts = uptime.split(', ');
    let weeks = 0, days = 0, hours = 0, minutes = 0;

    parts.forEach(part => {
      if (part.includes('week')) {
        weeks = parseInt(part.match(/\d+/)?.[0] || '0');
      } else if (part.includes('day')) {
        days = parseInt(part.match(/\d+/)?.[0] || '0');
      } else if (part.includes('hour')) {
        hours = parseInt(part.match(/\d+/)?.[0] || '0');
      } else if (part.includes('minute')) {
        minutes = parseInt(part.match(/\d+/)?.[0] || '0');
      }
    });

    // Convertir días a semanas si hay 7 o más días
    if (days >= 7) {
      weeks += Math.floor(days / 7);
      days = days % 7;
    }

    // Si hay semanas, las incluimos en el formato
    if (weeks > 0) {
      return `${weeks}w:${days}d:${hours}H:${minutes}m`;
    }

    return `${days}d:${hours}H:${minutes}m`;
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

  const getServiceIcon = (type: string) => {
    const iconMap = {
      nginx: <Globe className="w-5 h-5" />,
      apache: <Globe className="w-5 h-5" />,
      mysql: <Database className="w-5 h-5" />,
      postgresql: <Database className="w-5 h-5" />,
      redis: <Database className="w-5 h-5" />,
      mongodb: <Database className="w-5 h-5" />,
      wordpress: <Code className="w-5 h-5" />,
      nodejs: <Terminal className="w-5 h-5" />,
      docker: <Container className="w-5 h-5" />,
      php: <Code className="w-5 h-5" />
    };
    return iconMap[type as keyof typeof iconMap] || <Package className="w-5 h-5" />;
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return 'bg-red-400';
    if (value >= 60) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  return (
    <div
      onClick={() => onClick(server)}
      className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-white/10 cursor-pointer transition-all duration-300 group"
    >
      {/* Server Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-all duration-300">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{server.name}</h3>
            <p className="text-sm text-gray-300">{server.ip} • {server.os}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon(server.status)}
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors duration-300" />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-xs text-gray-400">Servicios</p>
          <p className="text-lg font-bold text-white">{server.activeServices ?? server.services.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Sitios</p>
          <p className="text-lg font-bold text-white">{server.websites.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Bases BD</p>
          <p className="text-lg font-bold text-white">{server.databases.length}</p>
        </div>
      </div>

      {/* Resource Usage */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-300 flex items-center space-x-1">
              <Cpu className="w-3 h-3" />
              <span>CPU</span>
            </span>
            <span className="text-sm text-white font-semibold">{server.cpu}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(server.cpu)}`}
              style={{ width: `${server.cpu}%` }}
            ></div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-300 flex items-center space-x-1">
              <BarChart3 className="w-3 h-3" />
              <span>RAM</span>
            </span>
            <span className="text-sm text-white font-semibold">{server.memory}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(server.memory)}`}
              style={{ width: `${server.memory}%` }}
            ></div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-300 flex items-center space-x-1">
              <HardDrive className="w-3 h-3" />
              <span>Disco</span>
            </span>
            <span className="text-sm text-white font-semibold">{server.disk}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(server.disk)}`}
              style={{ width: `${server.disk}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Service Icons Preview */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">Servicios activos:</span>
          <span className="text-xs text-white font-semibold">
            {server.services.filter(s => s.status === 'running').length}
          </span>
          <div className="flex space-x-1">
            {server.services.filter(s => s.status === 'running').slice(0, 4).map((service, idx) => (
              <div key={idx} className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300">
                {getServiceIcon(service.type)}
              </div>
            ))}
            {server.services.filter(s => s.status === 'running').length > 4 && (
              <div className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-xs text-purple-300 flex items-center font-semibold">
                +{server.services.filter(s => s.status === 'running').length - 4}
              </div>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-gray-400">Tiempo activo</p>
          <p className="text-sm text-white font-mono">{formatUptime(server.uptime)}</p>
        </div>
      </div>
    </div>
  );
};

