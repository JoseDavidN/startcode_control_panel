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
  Globe,
  Plus,
  ChevronRight,
  Package,
  Code,
  Cloud,
  Terminal,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Edit,
  Download,
  Upload,
  Shield,
  Key,
  Users,
  FolderOpen,
  FileText,
  Layers,
  Container,
  Zap
} from 'lucide-react';

interface ServiceData {
  id: string;
  name: string;
  type: 'nginx' | 'apache' | 'mysql' | 'postgresql' | 'redis' | 'mongodb' | 'wordpress' | 'nodejs' | 'docker' | 'php';
  status: 'running' | 'stopped' | 'error';
  port: number;
  version: string;
  cpu: number;
  memory: number;
}

interface WebsiteData {
  id: string;
  domain: string;
  type: 'wordpress' | 'static' | 'nodejs' | 'php' | 'react';
  status: 'active' | 'inactive' | 'maintenance';
  ssl: boolean;
  visits: number;
  storage: number;
}

interface DatabaseData {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'mongodb' | 'redis';
  size: number;
  tables: number;
  connections: number;
  status: 'connected' | 'disconnected';
}

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
  os: string;
  services: ServiceData[];
  websites: WebsiteData[];
  databases: DatabaseData[];
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
      ip: '192.168.1.10',
      os: 'Ubuntu 22.04',
      services: [
        { id: '1', name: 'Nginx', type: 'nginx', status: 'running', port: 80, version: '1.22.1', cpu: 2, memory: 8 },
        { id: '2', name: 'MySQL', type: 'mysql', status: 'running', port: 3306, version: '8.0.35', cpu: 15, memory: 25 },
        { id: '3', name: 'PHP-FPM', type: 'php', status: 'running', port: 9000, version: '8.2', cpu: 8, memory: 12 }
      ],
      websites: [
        { id: '1', domain: 'example.com', type: 'wordpress', status: 'active', ssl: true, visits: 15420, storage: 2.4 },
        { id: '2', domain: 'blog.example.com', type: 'static', status: 'active', ssl: true, visits: 8350, storage: 0.8 }
      ],
      databases: [
        { id: '1', name: 'wordpress_db', type: 'mysql', size: 145, tables: 12, connections: 8, status: 'connected' },
        { id: '2', name: 'analytics_db', type: 'mysql', size: 892, tables: 25, connections: 3, status: 'connected' }
      ]
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
      ip: '192.168.1.20',
      os: 'CentOS 8',
      services: [
        { id: '4', name: 'PostgreSQL', type: 'postgresql', status: 'running', port: 5432, version: '15.4', cpu: 45, memory: 60 },
        { id: '5', name: 'Redis', type: 'redis', status: 'running', port: 6379, version: '7.2.1', cpu: 12, memory: 8 },
        { id: '6', name: 'MongoDB', type: 'mongodb', status: 'error', port: 27017, version: '7.0.2', cpu: 0, memory: 0 }
      ],
      websites: [],
      databases: [
        { id: '3', name: 'main_app_db', type: 'postgresql', size: 2340, tables: 45, connections: 25, status: 'connected' },
        { id: '4', name: 'cache_store', type: 'redis', size: 128, tables: 0, connections: 12, status: 'connected' }
      ]
    }
  ]);

  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'websites' | 'databases' | 'files'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const totalServers = servers.length;
  const onlineServers = servers.filter(s => s.status === 'online').length;
  const totalServices = servers.reduce((acc, server) => acc + server.services.length, 0);
  const runningServices = servers.reduce((acc, server) =>
    acc + server.services.filter(s => s.status === 'running').length, 0);

  if (selectedServer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 p-6">
        {/* Server Header */}
        <header className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSelectedServer(null)}
                className="p-2 rounded-lg backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
              >
                <ChevronRight className="w-5 h-5 text-white rotate-180" />
              </button>
              <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg">
                <Server className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{selectedServer.name}</h1>
                <p className="text-gray-300">{selectedServer.ip} • {selectedServer.os}</p>
              </div>
              {getStatusIcon(selectedServer.status)}
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowInstallModal(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all duration-300 shadow-lg"
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
                <span className="text-white font-semibold">{selectedServer.cpu}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                <div className={`h-2 rounded-full ${getProgressColor(selectedServer.cpu)}`} style={{ width: `${selectedServer.cpu}%` }}></div>
              </div>
            </div>
            <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">Memoria</span>
                <span className="text-white font-semibold">{selectedServer.memory}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                <div className={`h-2 rounded-full ${getProgressColor(selectedServer.memory)}`} style={{ width: `${selectedServer.memory}%` }}></div>
              </div>
            </div>
            <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">Disco</span>
                <span className="text-white font-semibold">{selectedServer.disk}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                <div className={`h-2 rounded-full ${getProgressColor(selectedServer.disk)}`} style={{ width: `${selectedServer.disk}%` }}></div>
              </div>
            </div>
            <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="text-center">
                <span className="text-gray-300 text-sm">Tiempo Activo</span>
                <p className="text-white font-semibold font-mono">{selectedServer.uptime}</p>
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
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-white/10'
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'services' && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Servicios Instalados</h2>
              <button
                onClick={() => setShowInstallModal(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 transition-all duration-300"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Servicio</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {selectedServer.services.map(service => (
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
              <button className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all duration-300">
                <Plus className="w-4 h-4" />
                <span>Nuevo Sitio</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {selectedServer.websites.map(website => (
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
              <button className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all duration-300">
                <Plus className="w-4 h-4" />
                <span>Nueva Base de Datos</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {selectedServer.databases.map(database => (
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
  }

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
              <p className="text-gray-300">Administración de Servidores y Servicios</p>
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
              <p className="text-3xl font-bold text-green-400">{onlineServers}/{totalServers}</p>
            </div>
            <div className="p-3 rounded-xl bg-green-400/20">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Servicios Activos</p>
              <p className="text-3xl font-bold text-blue-400">{runningServices}/{totalServices}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-400/20">
              <Package className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Sitios Web</p>
              <p className="text-3xl font-bold text-purple-400">
                {servers.reduce((acc, server) => acc + server.websites.length, 0)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-400/20">
              <Globe className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Bases de Datos</p>
              <p className="text-3xl font-bold text-yellow-400">
                {servers.reduce((acc, server) => acc + server.databases.length, 0)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-yellow-400/20">
              <Database className="w-6 h-6 text-yellow-400" />
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
              onClick={() => setSelectedServer(server)}
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
                  <p className="text-lg font-bold text-white">{server.services.length}</p>
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
                  <div className="flex space-x-1">
                    {server.services.filter(s => s.status === 'running').slice(0, 4).map((service, idx) => (
                      <div key={idx} className="p-1 rounded bg-white/10">
                        {getServiceIcon(service.type)}
                      </div>
                    ))}
                    {server.services.filter(s => s.status === 'running').length > 4 && (
                      <div className="p-1 rounded bg-white/10 text-xs text-white flex items-center">
                        +{server.services.filter(s => s.status === 'running').length - 4}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-400">Tiempo activo</p>
                  <p className="text-sm text-white font-mono">{server.uptime}</p>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Add Server Button */}
      <div className="fixed bottom-8 right-8">
        <button className="p-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-2xl hover:from-green-600 hover:to-emerald-600 transition-all duration-300 hover:scale-110">
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default ServerDashboard;