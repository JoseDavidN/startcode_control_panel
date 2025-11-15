import { useState, useRef, useEffect } from 'react'
import { Search, Filter, RefreshCw, Check, X } from 'lucide-react'

export interface FilterOptions {
  status: string[];
  os: string[];
}

interface SearchFilterProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onClearAll?: () => void;
}

export const SearchFilter: React.FC<SearchFilterProps> = ({
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  onRefresh,
  isRefreshing = false,
  onClearAll,
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Opciones de filtros
  const statusOptions = [
    { value: 'online', label: 'En línea' },
    { value: 'offline', label: 'Desconectado' },
    { value: 'error', label: 'Error' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'checking', label: 'Verificando' },
  ];

  const osOptions = [
    { value: 'ubuntu', label: 'Ubuntu' },
    { value: 'centos', label: 'CentOS' },
    { value: 'debian', label: 'Debian' },
    { value: 'fedora', label: 'Fedora' },
    { value: 'arch', label: 'Arch Linux' },
    { value: 'solaris', label: 'Solaris' },
    { value: 'openbsd', label: 'OpenBSD' },
    { value: 'netbsd', label: 'NetBSD' },
    { value: 'freebsd', label: 'FreeBSD' },
    { value: 'other', label: 'Otro' },
  ];

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const toggleFilter = (type: 'status' | 'os', value: string) => {
    const currentFilters = filters[type];
    const newFilters = currentFilters.includes(value)
      ? currentFilters.filter(f => f !== value)
      : [...currentFilters, value];

    onFiltersChange({
      ...filters,
      [type]: newFilters,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      status: [],
      os: [],
    });
  };

  const clearAll = () => {
    onSearchChange('');
    clearFilters();
    if (onClearAll) {
      onClearAll();
    }
  };

  const hasActiveFilters = filters.status.length > 0 || filters.os.length > 0;
  const hasActiveSearch = searchTerm.trim().length > 0;
  const hasAnyFilter = hasActiveFilters || hasActiveSearch;
  const activeFiltersCount = filters.status.length + filters.os.length;

  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar servidores por nombre o IP..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
          {hasActiveSearch && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              title="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Botón Limpiar Filtros */}
          {hasAnyFilter && (
            <button
              onClick={clearAll}
              className="flex items-center space-x-2 px-4 py-3 rounded-xl backdrop-blur-sm bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 hover:border-red-500/70 transition-all duration-300"
              title="Limpiar búsqueda y filtros"
            >
              <X className="w-4 h-4" />
              <span>Limpiar</span>
            </button>
          )}

          {/* Botón de Filtros */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl backdrop-blur-sm border text-white transition-all duration-300 ${hasActiveFilters
                ? 'bg-purple-500/20 border-purple-500/50 hover:bg-purple-500/30'
                : 'bg-white/10 border-white/20 hover:bg-white/20'
                }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-purple-500 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Menú de Filtros */}
            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#1a0d2e] border border-purple-500/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Filtros</h3>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 max-h-96 overflow-y-auto">
                  {/* Filtro por Estado */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Estado</h4>
                    <div className="space-y-2">
                      {statusOptions.map((option) => {
                        const isSelected = filters.status.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                          >
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleFilter('status', option.value)}
                                className="sr-only"
                              />
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected
                                  ? 'bg-purple-500 border-purple-500'
                                  : 'border-gray-400'
                                  }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <span className="text-sm text-white">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Filtro por Sistema Operativo */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Sistema Operativo</h4>
                    <div className="space-y-2">
                      {osOptions.map((option) => {
                        const isSelected = filters.os.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                          >
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleFilter('os', option.value)}
                                className="sr-only"
                              />
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected
                                  ? 'bg-purple-500 border-purple-500'
                                  : 'border-gray-400'
                                  }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <span className="text-sm text-white">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Botón Aplicar */}
                <div className="p-4 border-t border-white/10">
                  <button
                    onClick={() => setIsFilterOpen(false)}
                    className="w-full px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300 font-medium"
                  >
                    Aplicar Filtros
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botón Actualizar */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`flex items-center space-x-2 px-4 py-3 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-lg ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
