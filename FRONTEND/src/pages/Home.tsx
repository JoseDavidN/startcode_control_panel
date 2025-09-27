import React, { useState, useEffect } from 'react';
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Settings,
  Bell,
  Search,
  Filter,
  RefreshCw,
  Monitor,
  Database,
  Globe
} from 'lucide-react';

interface ServerData {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  location: string;
  ip: string;
}

const ServerDashboard: React.FC = () => {
  const [servers, setServers] = useState<ServerData[]>([
    {
      id: '1',
      name: 'Web Server 01',
      status: 'online',
      cpu: 45,
      memory: 78,
      disk: 65,
      uptime: '15d 3h 42m',
      location: 'US East',
      ip: '192.168.1.10'
    },
    {
      id: '2',
      name: 'Database Server',
      status: 'warning',
      cpu: 89,
      memory: 92,
      disk: 45,
      uptime: '8d 12h 15m',
      location: 'EU West',
      ip: '192.168.1.20'
    },
    {
      id: '3',
      name: 'API Gateway',
      status: 'online',
      cpu: 23,
      memory: 56,
      disk: 78,
      uptime: '22d 8h 30m',
      location: 'Asia',
      ip: '192.168.1.30'
    },
    {
      id: '4',
      name: 'Mail Server',
      status: 'offline',
      cpu: 0,
      memory: 0,
      disk: 88,
      uptime: '0d 0h 0m',
      location: 'US West',
      ip: '192.168.1.40'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'border-green-400/30 bg-green-400/10';
      case 'warning':
        return 'border-yellow-400/30 bg-yellow-400/10';
      case 'offline':
        return 'border-red-400/30 bg-red-400/10';
      default:
        return 'border-gray-400/30 bg-gray-400/10';
    }
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return 'bg-red-400';
    if (value >= 60) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  const onlineServers = servers.filter(s => s.status === 'online').length;
  const warningServers = servers.filter(s => s.status === 'warning').length;
  const offlineServers = servers.filter(s => s.status === 'offline').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 p-6">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg">
              <Server className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Panel de Control</h1>
              <p className="text-gray-300">Gestión de Servidores</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-300">Hora actual</p>
              <p className="text-lg font-mono text-white">
                {currentTime.toLocaleTimeString()}
              </p>
            </div>
            <button className="p-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <Bell className="w-5 h-5 text-white" />
            </button>
            <button className="p-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Servidores Online</p>
              <p className="text-3xl font-bold text-green-400">{onlineServers}</p>
            </div>
            <div className="p-3 rounded-xl bg-green-400/20">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Advertencias</p>
              <p className="text-3xl font-bold text-yellow-400">{warningServers}</p>
            </div>
            <div className="p-3 rounded-xl bg-yellow-400/20">
              <AlertTriangle className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Servidores Offline</p>
              <p className="text-3xl font-bold text-red-400">{offlineServers}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-400/20">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Total Servidores</p>
              <p className="text-3xl font-bold text-white">{servers.length}</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-400/20">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar servidores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center space-x-3">
            <button className="flex items-center space-x-2 px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-300">
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all duration-300 shadow-lg">
              <RefreshCw className="w-4 h-4" />
              <span>Actualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Servers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {servers
          .filter(server =>
            server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            server.location.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .map((server) => (
            <div
              key={server.id}
              className={`backdrop-blur-xl bg-white/5 border rounded-2xl p-6 shadow-2xl hover:bg-white/10 transition-all duration-300 ${getStatusColor(server.status)}`}
            >
              {/* Server Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Monitor className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{server.name}</h3>
                    <p className="text-sm text-gray-300">{server.ip}</p>
                  </div>
                </div>
                {getStatusIcon(server.status)}
              </div>

              {/* Server Info */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 flex items-center space-x-2">
                    <Globe className="w-4 h-4" />
                    <span>Ubicación</span>
                  </span>
                  <span className="text-white">{server.location}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 flex items-center space-x-2">
                    <Activity className="w-4 h-4" />
                    <span>Tiempo activo</span>
                  </span>
                  <span className="text-white font-mono">{server.uptime}</span>
                </div>
              </div>

              {/* Resource Usage */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 flex items-center space-x-2">
                      <Cpu className="w-4 h-4" />
                      <span>CPU</span>
                    </span>
                    <span className="text-sm text-white font-semibold">{server.cpu}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(server.cpu)}`}
                      style={{ width: `${server.cpu}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Memoria</span>
                    </span>
                    <span className="text-sm text-white font-semibold">{server.memory}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(server.memory)}`}
                      style={{ width: `${server.memory}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 flex items-center space-x-2">
                      <HardDrive className="w-4 h-4" />
                      <span>Disco</span>
                    </span>
                    <span className="text-sm text-white font-semibold">{server.disk}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(server.disk)}`}
                      style={{ width: `${server.disk}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2 mt-6">
                <button className="flex-1 py-2 px-4 rounded-lg backdrop-blur-sm bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all duration-300">
                  Detalles
                </button>
                <button className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm hover:from-purple-600 hover:to-indigo-600 transition-all duration-300">
                  Gestionar
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ServerDashboard;