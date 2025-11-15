import React, { useState } from 'react';
import {
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Settings,
  Plus,
  ChevronRight,
  Package,
  Code,
  Terminal,
  Play,
  Pause,
  Database,
  Globe,
  Shield,
  FolderOpen,
  Container,
  Network,
  Activity,
  Cpu
} from 'lucide-react';
import { type ServerData } from '../../types/DashboardTypes';

// Datos de ejemplo
const serverData = {
  serverId: "srv-001",
  serverName: "DevStar",
  cpu: {
    usage: 100,
    cores: 4,
    loadAverage: "0.50, 0.45, 0.40"
  },
  memory: {
    total: 8192,
    used: 3440,
    free: 4752,
    usagePercent: 42
  },
  disk: [
    {
      total: 100,
      used: 14,
      free: 86,
      usagePercent: 14,
      mountPoint: "/"
    }
  ],
  network: {
    privateIp: "192.168.1.100",
    publicIp: "203.0.113.1",
    interface: "eth0"
  },
  system: {
    os: "Ubuntu 22.04.3 LTS",
    kernel: "5.15.0-91-generic",
    hostname: "cloud.startcode.com.co",
    uptime: "3 days, 7 hours, 27 minutes",
    uptimeSeconds: 1703001234
  },
  processes: {
    running: 145,
    zombie: 12,
    total: 157
  },
  timestamp: "2024-01-01T12:00:00Z",
  status: "online"
};

interface ServerDetailProps {
  server: ServerData;
  onBack: () => void;
}

export const ServerDetail: React.FC<ServerDetailProps> = ({ server, onBack }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'websites' | 'databases' | 'files'>('overview');
  const [showInstallModal, setShowInstallModal] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'running':
      case 'active':
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'warning':
      case 'maintenance':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'offline':
      case 'stopped':
      case 'error':
      case 'inactive':
      case 'disconnected':
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

  const getUsageBarColor = (percent: number) => {
    if (percent >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percent >= 70) return 'bg-gradient-to-r from-yellow-500 to-orange-600';
    if (percent >= 50) return 'bg-gradient-to-r from-blue-500 to-cyan-600';
    return 'bg-gradient-to-r from-green-500 to-emerald-600';
  };

  const formatBytes = (bytes: number) => {
    return `${(bytes / 1024).toFixed(1)} GB`;
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#1a0d2e] via-[#2d1b4e] to-[#1a0d2e] p-6">
      {/* Server Header */}
      <header className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
            >
              <ChevronRight className="w-5 h-5 text-white rotate-180" />
            </button>
            <div className="p-3 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 shadow-lg">
              <Server className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{server.name}</h1>
              <p className="text-gray-300">{server.ip} • {server.os}</p>
            </div>
            {getStatusIcon(server.status)}
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Instalar Servicio</span>
            </button>
            <button className="p-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Server Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">CPU</span>
              <span className="text-white font-semibold">{server.cpu}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 mt-2">
              <div className={`h-2 rounded-full ${getProgressColor(server.cpu)}`} style={{ width: `${server.cpu}%` }}></div>
            </div>
          </div>
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">Memoria</span>
              <span className="text-white font-semibold">{server.memory}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 mt-2">
              <div className={`h-2 rounded-full ${getProgressColor(server.memory)}`} style={{ width: `${server.memory}%` }}></div>
            </div>
          </div>
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">Disco</span>
              <span className="text-white font-semibold">{server.disk}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 mt-2">
              <div className={`h-2 rounded-full ${getProgressColor(server.disk)}`} style={{ width: `${server.disk}%` }}></div>
            </div>
          </div>
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="text-center">
              <span className="text-gray-300 text-sm">Tiempo Activo</span>
              <p className="text-white font-semibold font-mono">{server.uptime}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
        <div className="flex space-x-1">
          {[
            { id: 'overview', label: 'Resumen', icon: BarChart3 },
            { id: 'services', label: 'Servicios', icon: Package },
            { id: 'websites', label: 'Sitios Web', icon: Globe },
            { id: 'databases', label: 'Bases de Datos', icon: Database },
            { id: 'files', label: 'Archivos', icon: FolderOpen }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 ${activeTab === id
                ? 'bg-linear-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : 'text-gray-300 hover:bg-white/10'
                }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Información del Sistema */}
          <div className="bg-[#2a1a4a]/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-purple-400" />
              Información del Sistema
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">Sistema Operativo</span>
                <span className="text-sm text-white font-medium">{serverData.system.os}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">Kernel</span>
                <span className="text-sm text-white font-medium">{serverData.system.kernel}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">Hostname</span>
                <span className="text-sm text-white font-medium">{serverData.system.hostname}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">Load Average</span>
                <span className="text-sm text-white font-medium">{serverData.cpu.loadAverage}</span>
              </div>
            </div>
          </div>

          {/* Red */}
          <div className="bg-[#2a1a4a]/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-400" />
              Red
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">IP Privada</span>
                <span className="text-sm text-white font-medium">{serverData.network.privateIp}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">IP Pública</span>
                <span className="text-sm text-white font-medium">{serverData.network.publicIp}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-sm text-purple-300/70">Interfaz</span>
                <span className="text-sm text-white font-medium">{serverData.network.interface}</span>
              </div>
            </div>
          </div>

          {/* Procesos */}
          <div className="bg-[#2a1a4a]/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              Procesos
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-[#1a0d2e]/50 rounded-xl">
                <p className="text-2xl font-bold text-white mb-1">{serverData.processes.running}</p>
                <p className="text-xs text-purple-300/70">En ejecución</p>
              </div>
              <div className="text-center p-4 bg-[#1a0d2e]/50 rounded-xl">
                <p className="text-2xl font-bold text-red-400 mb-1">{serverData.processes.zombie}</p>
                <p className="text-xs text-purple-300/70">Zombies</p>
              </div>
              <div className="text-center p-4 bg-[#1a0d2e]/50 rounded-xl">
                <p className="text-2xl font-bold text-white mb-1">{serverData.processes.total}</p>
                <p className="text-xs text-purple-300/70">Total</p>
              </div>
            </div>
          </div>

          {/* Recursos Detallados */}
          <div className="bg-[#2a1a4a]/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Recursos Detallados
            </h3>
            <div className="space-y-4">
              {/* CPU Detalle */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-purple-300/70">CPU</span>
                  <span className="text-sm text-white font-medium">{serverData.cpu.usage}%</span>
                </div>
                <div className="h-3 bg-[#1a0d2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageBarColor(serverData.cpu.usage)} transition-all duration-500`}
                    style={{ width: `${serverData.cpu.usage}%` }}
                  ></div>
                </div>
              </div>

              {/* Memoria Detalle */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-purple-300/70">Memoria RAM</span>
                  <span className="text-sm text-white font-medium">
                    {formatBytes(serverData.memory.used)} / {formatBytes(serverData.memory.total)}
                  </span>
                </div>
                <div className="h-3 bg-[#1a0d2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageBarColor(serverData.memory.usagePercent)} transition-all duration-500`}
                    style={{ width: `${serverData.memory.usagePercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Disco Detalle */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-purple-300/70">Disco ({serverData.disk[0].mountPoint})</span>
                  <span className="text-sm text-white font-medium">
                    {serverData.disk[0].used} GB / {serverData.disk[0].total} GB
                  </span>
                </div>
                <div className="h-3 bg-[#1a0d2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageBarColor(serverData.disk[0].usagePercent)} transition-all duration-500`}
                    style={{ width: `${serverData.disk[0].usagePercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'services' && (
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Servicios Instalados</h2>
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Servicio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {server.services.map(service => (
              <div key={service.id} className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-white/20">
                      {getServiceIcon(service.type)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                      <p className="text-sm text-gray-300">v{service.version} • Puerto {service.port}</p>
                    </div>
                  </div>
                  {getStatusIcon(service.status)}
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">CPU</span>
                      <span className="text-white">{service.cpu}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${getProgressColor(service.cpu)}`} style={{ width: `${service.cpu}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">Memoria</span>
                      <span className="text-white">{service.memory}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${getProgressColor(service.memory)}`} style={{ width: `${service.memory}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-all duration-300">
                    <Play className="w-4 h-4" />
                    <span>Iniciar</span>
                  </button>
                  <button className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all duration-300">
                    <Pause className="w-4 h-4" />
                    <span>Parar</span>
                  </button>
                  <button className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-300">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'websites' && (
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Sitios Web</h2>
            <button className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300">
              <Plus className="w-4 h-4" />
              <span>Nuevo Sitio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {server.websites.map(website => (
              <div key={website.id} className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-white/20">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{website.domain}</h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-300 capitalize">{website.type}</span>
                        {website.ssl && <Shield className="w-4 h-4 text-green-400" />}
                      </div>
                    </div>
                  </div>
                  {getStatusIcon(website.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-300">Visitas</p>
                    <p className="text-xl font-semibold text-white">{website.visits.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Almacenamiento</p>
                    <p className="text-xl font-semibold text-white">{website.storage} GB</p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button className="flex-1 py-2 px-3 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-300">
                    Gestionar
                  </button>
                  <button className="flex-1 py-2 px-3 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all duration-300">
                    Visitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'databases' && (
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Bases de Datos</h2>
            <button className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300">
              <Plus className="w-4 h-4" />
              <span>Nueva Base de Datos</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {server.databases.map(database => (
              <div key={database.id} className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-white/20">
                      <Database className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{database.name}</h3>
                      <p className="text-sm text-gray-300 uppercase">{database.type}</p>
                    </div>
                  </div>
                  {getStatusIcon(database.status)}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-300">Tamaño</p>
                    <p className="text-lg font-semibold text-white">{database.size} MB</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Tablas</p>
                    <p className="text-lg font-semibold text-white">{database.tables}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Conexiones</p>
                    <p className="text-lg font-semibold text-white">{database.connections}</p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button className="flex-1 py-2 px-3 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-300">
                    Gestionar
                  </button>
                  <button className="flex-1 py-2 px-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-all duration-300">
                    Backup
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Install Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">Instalar Nuevo Servicio</h3>
              <button
                onClick={() => setShowInstallModal(false)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300"
              >
                <XCircle className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { name: 'Nginx', type: 'nginx', icon: Globe, desc: 'Servidor web y proxy inverso' },
                { name: 'Apache', type: 'apache', icon: Globe, desc: 'Servidor web HTTP' },
                { name: 'MySQL', type: 'mysql', icon: Database, desc: 'Base de datos relacional' },
                { name: 'PostgreSQL', type: 'postgresql', icon: Database, desc: 'Base de datos avanzada' },
                { name: 'Redis', type: 'redis', icon: Database, desc: 'Base de datos en memoria' },
                { name: 'MongoDB', type: 'mongodb', icon: Database, desc: 'Base de datos NoSQL' },
                { name: 'WordPress', type: 'wordpress', icon: Code, desc: 'CMS popular' },
                { name: 'Node.js', type: 'nodejs', icon: Terminal, desc: 'Runtime de JavaScript' },
                { name: 'Docker', type: 'docker', icon: Container, desc: 'Plataforma de contenedores' },
              ].map(({ name, type, icon: Icon, desc }) => (
                <button
                  key={type}
                  className="p-4 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300 text-left"
                >
                  <Icon className="w-8 h-8 text-white mb-2" />
                  <h4 className="font-semibold text-white mb-1">{name}</h4>
                  <p className="text-sm text-gray-300">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

