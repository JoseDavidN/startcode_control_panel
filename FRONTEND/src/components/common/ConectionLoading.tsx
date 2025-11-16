import { useState, useEffect } from 'react';
import { Loader, Server, Shield, Activity, CheckCircle2, Wifi } from 'lucide-react';

export const ConnectionLoading = () => {
  const [connectionSteps, setConnectionSteps] = useState([
    { icon: Wifi, label: 'Iniciando conexión', completed: false, active: true },
    { icon: Shield, label: 'Autenticación SSH', completed: false, active: false },
    { icon: Server, label: 'Conectando al servidor', completed: false, active: false },
    { icon: Activity, label: 'Obteniendo métricas', completed: false, active: false },
  ]);

  useEffect(() => {
    const timings = [1500, 3000, 4500, 6000];

    timings.forEach((time, index) => {
      setTimeout(() => {
        setConnectionSteps(prev => {
          const newSteps = [...prev];
          if (index > 0) {
            newSteps[index - 1].completed = true;
            newSteps[index - 1].active = false;
          }
          newSteps[index].active = true;
          return newSteps;
        });
      }, time);
    });

    setTimeout(() => {
      setConnectionSteps(prev => {
        const newSteps = [...prev];
        newSteps[3].completed = true;
        newSteps[3].active = false;
        return newSteps;
      });
    }, 7000);
  }, []);

  return (
    <div className="w-full max-w-md">
      <div className="relative p-1 rounded-2xl w-full overflow-hidden">
        {/* Animated gradient border */}
        <div
          className="absolute inset-0 animate-spin-slow"
          style={{
            background: 'conic-gradient(from 0deg, #9333ea, #ec4899, #3b82f6, #9333ea)',
            animation: 'spin 3s linear infinite'
          }}
        />

        {/* Content container */}
        <div className="relative bg-[#1a0d2e] rounded-2xl p-8 z-10">
          {/* Loading spinner central */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-purple-500/20"></div>
              <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-purple-500 border-r-pink-500 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Server className="w-8 h-8 text-purple-400" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-white text-center mb-2">
            Conectando al Servidor
          </h3>
          <p className="text-sm text-purple-300/70 text-center mb-8">
            Estableciendo conexión segura
          </p>

          {/* Connection steps */}
          <div className="space-y-4">
            {connectionSteps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-500 ${step.active
                    ? 'bg-purple-500/10 border border-purple-500/30'
                    : step.completed
                      ? 'bg-green-500/5 border border-green-500/20'
                      : 'bg-[#0f0623]/30 border border-purple-500/10'
                    }`}
                >
                  <div className="relative flex-shrink-0">
                    {step.completed ? (
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      </div>
                    ) : step.active ? (
                      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <IconComponent className="w-5 h-5 text-purple-400 animate-pulse" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-purple-500/5 flex items-center justify-center">
                        <IconComponent className="w-5 h-5 text-purple-400/40" />
                      </div>
                    )}

                    {step.active && (
                      <div className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping"></div>
                    )}
                  </div>

                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium transition-colors ${step.active
                        ? 'text-white'
                        : step.completed
                          ? 'text-green-300'
                          : 'text-purple-300/50'
                        }`}
                    >
                      {step.label}
                    </p>
                  </div>

                  {step.active && (
                    <Loader className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-2 bg-[#0f0623] rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${(connectionSteps.filter(s => s.completed).length / connectionSteps.length) * 100}%`
                }}
              ></div>
            </div>
          </div>

          {/* Additional info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-purple-400/50">
              Conexión cifrada SSH
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};