import { useState, useEffect } from 'react';
import { Server, AlertTriangle, Home, RefreshCw, Search, Database, Cloud, HardDrive, Network, Shield, Terminal, Wifi, Activity, XCircle } from 'lucide-react';

export const NotFound = () => {
  const [glitchActive, setGlitchActive] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  const fullText = '$ ERROR: Server not found. Status code: 404';

  useEffect(() => {
    // Efecto de glitch aleatorio
    const glitchInterval = setInterval(() => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 200);
    }, 3000);

    return () => clearInterval(glitchInterval);
  }, []);

  useEffect(() => {
    // Efecto de escritura en terminal
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setTerminalText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, []);

  const handleGoHome = () => {
    console.log('Navegando al inicio...');
    // window.location.href = '/';
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0d2e] via-[#2d1b4e] to-[#1a0d2e] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-96 h-96 bg-red-500/10 rounded-full blur-3xl -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -bottom-48 -right-48 animate-pulse delay-700"></div>
        <div className="absolute w-64 h-64 bg-pink-500/10 rounded-full blur-3xl top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse delay-1000"></div>
      </div>

      {/* Floating server icons - disconnected/error theme */}
      <div className="absolute inset-0">
        {[
          { Icon: XCircle, delay: 0, duration: 15, x: 10, y: 15 },
          { Icon: Database, delay: 2, duration: 18, x: 85, y: 20 },
          { Icon: Cloud, delay: 4, duration: 20, x: 15, y: 75 },
          { Icon: AlertTriangle, delay: 1, duration: 16, x: 75, y: 65 },
          { Icon: HardDrive, delay: 3, duration: 17, x: 50, y: 10 },
          { Icon: Network, delay: 5, duration: 19, x: 90, y: 80 },
          { Icon: Shield, delay: 2.5, duration: 14, x: 25, y: 45 },
          { Icon: Terminal, delay: 4.5, duration: 21, x: 65, y: 30 },
          { Icon: Wifi, delay: 1.5, duration: 16, x: 40, y: 85 },
          { Icon: AlertTriangle, delay: 3.5, duration: 18, x: 80, y: 45 },
          { Icon: Activity, delay: 0.5, duration: 15, x: 20, y: 60 },
          { Icon: XCircle, delay: 5.5, duration: 19, x: 55, y: 70 },
        ].map((item, i) => {
          const IconComponent = item.Icon;
          const isErrorIcon = item.Icon === XCircle || item.Icon === AlertTriangle;
          return (
            <div
              key={i}
              className="absolute animate-floatIcon opacity-20 hover:opacity-40 transition-opacity duration-300"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                animationDelay: `${item.delay}s`,
                animationDuration: `${item.duration}s`
              }}
            >
              <IconComponent
                className={`w-8 h-8 ${isErrorIcon ? 'text-red-400' : 'text-purple-400'}`}
                strokeWidth={1.5}
              />
            </div>
          );
        })}
      </div>

      {/* Error lines - disconnected */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10">
        <defs>
          <linearGradient id="errorLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {[
          { x1: '10%', y1: '15%', x2: '50%', y2: '10%' },
          { x1: '85%', y1: '20%', x2: '65%', y2: '30%' },
          { x1: '15%', y1: '75%', x2: '40%', y2: '85%' },
          { x1: '75%', y1: '65%', x2: '90%', y2: '80%' },
        ].map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="url(#errorLineGradient)"
            strokeWidth="1"
            strokeDasharray="5,5"
            className="animate-pulse"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </svg>

      {/* Main Error Card */}
      <div className="relative z-10 w-full max-w-3xl">
        <div className="bg-[#0f0623]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 p-8 md:p-12 transform transition-all duration-500">

          {/* Error Icon and Code */}
          <div className="text-center mb-8 animate-fadeIn">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-600 to-purple-600 rounded-2xl mb-6 shadow-lg shadow-red-500/50 animate-float relative">
              <Server className="w-12 h-12 text-white" strokeWidth={2} />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                <XCircle className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
            </div>

            {/* 404 with glitch effect */}
            <div className="relative inline-block mb-4">
              <h1 className={`text-8xl md:text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-purple-400 to-pink-400 ${glitchActive ? 'glitch' : ''}`}>
                404
              </h1>
              {glitchActive && (
                <>
                  <h1 className="absolute top-0 left-0 text-8xl md:text-9xl font-bold text-red-500 opacity-70 glitch-layer-1">
                    404
                  </h1>
                  <h1 className="absolute top-0 left-0 text-8xl md:text-9xl font-bold text-blue-500 opacity-70 glitch-layer-2">
                    404
                  </h1>
                </>
              )}
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Servidor No Encontrado
            </h2>
            <p className="text-purple-300/70 text-base md:text-lg max-w-md mx-auto">
              El recurso que estás buscando no existe o ha sido movido. La conexión al servidor falló.
            </p>
          </div>

          {/* Terminal Output */}
          <div className="mb-8 bg-[#0a0118] rounded-xl p-4 border border-red-500/20 font-mono text-sm">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-purple-400/50 text-xs ml-2">server@terminal</span>
            </div>
            <div className="text-red-400">
              {terminalText}
              <span className="animate-pulse">_</span>
            </div>
            <div className="text-purple-400/50 mt-2">
              ~ Connection timeout after 30 seconds
            </div>
            <div className="text-purple-400/50">
              ~ Please check the URL or return to dashboard
            </div>
          </div>

          {/* Error Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-[#1a0d2e]/50 rounded-xl p-4 border border-purple-500/20 text-center">
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-xs text-purple-300/70">Status</p>
              <p className="text-lg font-bold text-white">Error</p>
            </div>
            <div className="bg-[#1a0d2e]/50 rounded-xl p-4 border border-purple-500/20 text-center">
              <Terminal className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <p className="text-xs text-purple-300/70">Code</p>
              <p className="text-lg font-bold text-white">404</p>
            </div>
            <div className="bg-[#1a0d2e]/50 rounded-xl p-4 border border-purple-500/20 text-center">
              <Network className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-xs text-purple-300/70">Connection</p>
              <p className="text-lg font-bold text-white">Lost</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleGoHome}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <Home className="w-5 h-5" />
              <span>Volver al Inicio</span>
            </button>

            <button
              onClick={handleRefresh}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-[#1a0d2e] hover:bg-[#2d1b4e] text-white font-semibold rounded-xl border border-purple-500/30 hover:border-purple-500/50 transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Reintentar</span>
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-8 text-center">
            <p className="text-xs text-purple-400/50 mb-2">
              ¿Necesitas ayuda?
            </p>
            <div className="flex items-center justify-center space-x-4 text-xs">
              <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors flex items-center space-x-1">
                <Search className="w-3 h-3" />
                <span>Buscar</span>
              </a>
              <span className="text-purple-500/50">|</span>
              <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors flex items-center space-x-1">
                <Terminal className="w-3 h-3" />
                <span>Soporte</span>
              </a>
              <span className="text-purple-500/50">|</span>
              <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors flex items-center space-x-1">
                <Activity className="w-3 h-3" />
                <span>Estado del Sistema</span>
              </a>
            </div>
          </div>
        </div>

        {/* Decorative shadow */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-3/4 h-4 bg-red-600/20 blur-xl rounded-full"></div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          25% {
            transform: translateY(-20px) translateX(10px);
          }
          50% {
            transform: translateY(-10px) translateX(-10px);
          }
          75% {
            transform: translateY(-15px) translateX(5px);
          }
        }

        @keyframes floatIcon {
          0%, 100% {
            transform: translateY(0) translateX(0) rotate(0deg);
          }
          25% {
            transform: translateY(-30px) translateX(20px) rotate(5deg);
          }
          50% {
            transform: translateY(-15px) translateX(-15px) rotate(-3deg);
          }
          75% {
            transform: translateY(-25px) translateX(10px) rotate(2deg);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-floatIcon {
          animation: floatIcon 15s ease-in-out infinite;
        }

        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out;
        }

        .delay-700 {
          animation-delay: 700ms;
        }

        .delay-1000 {
          animation-delay: 1000ms;
        }

        .glitch {
          animation: glitch 0.3s ease-in-out;
        }

        .glitch-layer-1 {
          animation: glitch-1 0.3s ease-in-out;
        }

        .glitch-layer-2 {
          animation: glitch-2 0.3s ease-in-out;
        }

        @keyframes glitch {
          0% {
            transform: translate(0);
          }
          20% {
            transform: translate(-2px, 2px);
          }
          40% {
            transform: translate(-2px, -2px);
          }
          60% {
            transform: translate(2px, 2px);
          }
          80% {
            transform: translate(2px, -2px);
          }
          100% {
            transform: translate(0);
          }
        }

        @keyframes glitch-1 {
          0% {
            transform: translate(0);
            opacity: 0.7;
          }
          50% {
            transform: translate(-5px, 3px);
            opacity: 0.5;
          }
          100% {
            transform: translate(0);
            opacity: 0.7;
          }
        }

        @keyframes glitch-2 {
          0% {
            transform: translate(0);
            opacity: 0.7;
          }
          50% {
            transform: translate(5px, -3px);
            opacity: 0.5;
          }
          100% {
            transform: translate(0);
            opacity: 0.7;
          }
        }
      `}} />
    </div>
  );
};