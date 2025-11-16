import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Server, Eye, EyeOff, Database, Cloud, Cpu, HardDrive, Network, Shield, Terminal, Wifi, Globe, Activity } from 'lucide-react';
import { ROUTES } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login({ email, password });
      // Redirigir al dashboard después del login exitoso
      navigate(ROUTES.DASHBOARD);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión. Por favor, verifica tus credenciales.');
      console.error('Login error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0d2e] via-[#2d1b4e] to-[#1a0d2e] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -bottom-48 -right-48 animate-pulse delay-700"></div>
        <div className="absolute w-64 h-64 bg-pink-500/10 rounded-full blur-3xl top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse delay-1000"></div>
      </div>

      {/* Floating server icons */}
      <div className="absolute inset-0">
        {[
          { Icon: Server, delay: 0, duration: 15, x: 10, y: 15 },
          { Icon: Database, delay: 2, duration: 18, x: 85, y: 20 },
          { Icon: Cloud, delay: 4, duration: 20, x: 15, y: 75 },
          { Icon: Cpu, delay: 1, duration: 16, x: 75, y: 65 },
          { Icon: HardDrive, delay: 3, duration: 17, x: 50, y: 10 },
          { Icon: Network, delay: 5, duration: 19, x: 90, y: 80 },
          { Icon: Shield, delay: 2.5, duration: 14, x: 25, y: 45 },
          { Icon: Terminal, delay: 4.5, duration: 21, x: 65, y: 30 },
          { Icon: Wifi, delay: 1.5, duration: 16, x: 40, y: 85 },
          { Icon: Globe, delay: 3.5, duration: 18, x: 80, y: 45 },
          { Icon: Activity, delay: 0.5, duration: 15, x: 20, y: 60 },
          { Icon: Database, delay: 5.5, duration: 19, x: 55, y: 70 },
        ].map((item, i) => {
          const IconComponent = item.Icon;
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
                className="w-10 h-10 text-purple-400"
                strokeWidth={1.5}
              />
            </div>
          );
        })}
      </div>

      {/* Connecting lines between icons */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {[
          { x1: '10%', y1: '15%', x2: '50%', y2: '10%' },
          { x1: '85%', y1: '20%', x2: '65%', y2: '30%' },
          { x1: '15%', y1: '75%', x2: '40%', y2: '85%' },
          { x1: '75%', y1: '65%', x2: '90%', y2: '80%' },
          { x1: '25%', y1: '45%', x2: '50%', y2: '10%' },
          { x1: '80%', y1: '45%', x2: '65%', y2: '30%' },
        ].map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="url(#lineGradient)"
            strokeWidth="1"
            className="animate-pulse"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </svg>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-[#0f0623]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 p-8 transform transition-all duration-500 hover:scale-[1.02]">
          {/* Logo and Header */}
          <div className="text-center mb-8 animate-fadeIn">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl mb-4 shadow-lg shadow-purple-500/50 animate-float">
              <Server className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              Server Control
            </h1>
            <p className="text-purple-300/70 text-sm">
              Panel de Administración
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div className="relative group">
              <label htmlFor="email" className="block text-sm font-medium text-purple-300 mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-purple-400/50 group-hover:text-purple-400 transition-colors" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full pl-12 pr-4 py-3 bg-[#1a0d2e]/50 border border-purple-500/30 rounded-xl text-white placeholder-purple-400/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-300 hover:border-purple-500/50"
                  placeholder="admin@servidor.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="relative group">
              <label htmlFor="password" className="block text-sm font-medium text-purple-300 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-purple-400/50 group-hover:text-purple-400 transition-colors" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full pl-12 pr-12 py-3 bg-[#1a0d2e]/50 border border-purple-500/30 rounded-xl text-white placeholder-purple-400/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-300 hover:border-purple-500/50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-purple-400/50 hover:text-purple-400 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-[#1a0d2e] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Iniciando sesión...</span>
                </div>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-purple-400/50">
              Acceso seguro al panel de servidores
            </p>
          </div>
        </div>

        {/* Additional decorative element */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-3/4 h-4 bg-purple-600/20 blur-xl rounded-full"></div>
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
          animation: float 10s ease-in-out infinite;
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
      ` }} />
    </div>
  );
};