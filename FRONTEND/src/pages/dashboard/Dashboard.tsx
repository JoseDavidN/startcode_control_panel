import React, { useState, useMemo } from 'react';
import { Plus, AlertCircle, Loader } from 'lucide-react';
import { Header, Stats, ServerCard } from '../../components/Dashboard';
import { SearchFilter, AddServerModal, type FilterOptions } from '../../components/common';
import { ServerDetail } from '../../components/servers';
import { type ServerData } from '../../types/DashboardTypes';
import { useServers, useRefreshAllServers } from '../../hooks/useServers';
import type { Server } from '../../services/server.service';

export const Dashboard: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterOptions>({
    status: [],
    os: [],
  });

  // Obtener servidores del backend con TanStack Query
  const { data: servers = [], isLoading, isError, error } = useServers();

  // Mutación para actualizar quickstats de todos los servidores
  const refreshAllServersMutation = useRefreshAllServers();

  // Función para transformar Server del backend a ServerData para el UI
  const transformServerToServerData = (server: Server): ServerData => {
    return {
      id: server.id,
      name: server.name,
      status: server.status === 'online' ? 'online' :
        server.status === 'error' ? 'offline' : 'warning',
      cpu: server.metadata?.cpu ?? 0,
      memory: server.metadata?.memory ?? 0,
      disk: server.metadata?.disk ?? 0,
      uptime: server.metadata?.uptime ?? 'N/A',
      activeServices: server.metadata?.activeServices ?? 0,
      location: 'N/A',
      ip: server.host,
      os: server.os,
      services: [],
      websites: [],
      databases: []
    };
  };

  const handleAddServerSuccess = () => {
    setIsAddModalOpen(false);
  };

  const handleRefresh = () => {
    // Ejecutar quickstats para todos los servidores y luego refrescar la lista
    refreshAllServersMutation.mutate();
  };

  // Filtrar servidores según búsqueda y filtros
  const filteredServers = useMemo(() => {
    return servers.filter((server) => {
      // Filtro por búsqueda (nombre o IP)
      const matchesSearch =
        searchTerm === '' ||
        server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        server.host.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtro por estado
      const matchesStatus =
        filters.status.length === 0 || filters.status.includes(server.status);

      // Filtro por sistema operativo
      const matchesOS = filters.os.length === 0 || filters.os.includes(server.os);

      return matchesSearch && matchesStatus && matchesOS;
    });
  }, [servers, searchTerm, filters]);

  if (selectedServer) {
    return <ServerDetail server={selectedServer} onBack={() => setSelectedServer(null)} />;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-[#1a0d2e] via-[#2d1b4e] to-[#1a0d2e] p-6">
      {/* Header */}
      <Header />

      {/* Stats Overview */}
      <Stats />

      {/* Search and Filters */}
      <SearchFilter
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={handleRefresh}
        isRefreshing={refreshAllServersMutation.isPending}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader className="w-12 h-12 text-purple-500 animate-spin" />
            <p className="text-gray-300">Cargando servidores...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <p className="text-gray-300">Error al cargar los servidores</p>
            <p className="text-sm text-gray-400">
              {error instanceof Error ? error.message : 'Error desconocido'}
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && servers.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="p-6 rounded-full bg-purple-500/10 border border-purple-500/30">
              <Plus className="w-12 h-12 text-purple-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">No tienes servidores</h3>
            <p className="text-gray-400">
              Comienza agregando tu primer servidor para monitorearlo
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-4 px-6 py-3 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300"
            >
              Agregar Servidor
            </button>
          </div>
        </div>
      )}

      {/* Servers Grid */}
      {!isLoading && !isError && servers.length > 0 && (
        <>
          {filteredServers.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4 max-w-md text-center">
                <AlertCircle className="w-12 h-12 text-gray-500" />
                <h3 className="text-xl font-bold text-white">No se encontraron servidores</h3>
                <p className="text-gray-400">
                  No hay servidores que coincidan con los filtros o la búsqueda actual.
                </p>
                {(filters.status.length > 0 || filters.os.length > 0 || searchTerm) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilters({ status: [], os: [] });
                    }}
                    className="mt-4 px-6 py-3 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300"
                  >
                    Limpiar Filtros
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={transformServerToServerData(server)}
                  onClick={setSelectedServer}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Server Button */}
      <div className="fixed bottom-8 right-8">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="p-4 rounded-full bg-linear-to-r from-purple-600 to-pink-600 text-white shadow-2xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 hover:scale-110"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Add Server Modal */}
      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddServerSuccess}
      />
    </div>
  );
};
