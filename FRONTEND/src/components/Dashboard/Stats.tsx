import { CheckCircle, Package, Globe, Database } from 'lucide-react'
import { useServerStats } from '../../hooks/useServerStats'

export const Stats = () => {
  const { stats, isLoading } = useServerStats();
  const { totalServers, onlineServers, totalServices, runningServices } = stats;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm">Servidores Online</p>
              <p className="text-3xl font-bold text-green-400">{isLoading ? '-' : `${onlineServers}/${totalServers}`}</p>
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
              <p className="text-3xl font-bold text-blue-400">{isLoading ? '-' : `${runningServices}/${totalServices}`}</p>
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
              <p className="text-3xl font-bold text-purple-400">-</p>
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
              <p className="text-3xl font-bold text-yellow-400">-</p>
            </div>
            <div className="p-3 rounded-xl bg-yellow-400/20">
              <Database className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
