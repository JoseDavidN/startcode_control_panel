import React, { useState } from 'react';
import { Server, AlertCircle, Loader, Key, Lock, CheckCircle, Copy, Info, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { useCreateServer } from '../../hooks/useServers';
import { ConnectionLoading } from './ConectionLoading';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ServerFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKey: string;
  os: string;
  description: string;
}

const OS_OPTIONS = [
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

export const AddServerModal: React.FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    privateKey: '',
    os: 'ubuntu',
    description: '',
  });

  const createServerMutation = useCreateServer();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Función para validar la clave privada
  const validatePrivateKey = (key: string): { valid: boolean; error?: string } => {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: 'La clave privada es requerida' };
    }

    const trimmedKey = key.trim();

    // Verificar que tenga el formato correcto (PEM o OpenSSH)
    if (!trimmedKey.includes('BEGIN') || !trimmedKey.includes('PRIVATE KEY')) {
      return {
        valid: false,
        error: 'La clave no tiene el formato correcto. Debe contener "BEGIN ... PRIVATE KEY"'
      };
    }

    // Verificar que tenga los delimitadores completos con exactamente 5 guiones
    const beginPattern = /-----BEGIN [A-Z ]+PRIVATE KEY-----/;
    const endPattern = /-----END [A-Z ]+PRIVATE KEY-----/;

    if (!beginPattern.test(trimmedKey)) {
      return {
        valid: false,
        error: 'La clave debe comenzar con "-----BEGIN ... PRIVATE KEY-----"'
      };
    }

    if (!endPattern.test(trimmedKey)) {
      return {
        valid: false,
        error: 'La clave debe terminar con "-----END ... PRIVATE KEY-----"'
      };
    }

    // Verificar si tiene passphrase (solo para formato PEM antiguo)
    if (trimmedKey.includes('BEGIN RSA PRIVATE KEY') || trimmedKey.includes('BEGIN DSA PRIVATE KEY') || trimmedKey.includes('BEGIN EC PRIVATE KEY')) {
      if (trimmedKey.includes('ENCRYPTED')) {
        return {
          valid: false,
          error: 'La clave tiene passphrase. Remuévela con: ssh-keygen -p -N "" -f tu_clave'
        };
      }
    }

    // Verificar longitud mínima (claves ed25519 OpenSSH son más cortas que RSA PEM)
    const isOpenSSH = trimmedKey.includes('BEGIN OPENSSH PRIVATE KEY');
    const minLength = isOpenSSH ? 400 : 800;

    if (trimmedKey.length < minLength) {
      return {
        valid: false,
        error: 'La clave parece estar incompleta. Asegúrate de copiar todo el contenido'
      };
    }

    return { valid: true };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Si es la clave privada, limpiar y validar
    if (name === 'privateKey') {
      // Limpiar la clave de posibles problemas de encoding
      const cleanedKey = value
        .trim()
        .replace(/\r\n/g, '\n') // Normalizar saltos de línea Windows
        .replace(/\r/g, '\n');   // Normalizar saltos de línea Mac antiguo

      setFormData(prev => ({
        ...prev,
        privateKey: cleanedKey
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'port' ? parseInt(value) || 22 : value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validar la clave privada antes de enviar
    const keyValidation = validatePrivateKey(formData.privateKey);
    if (!keyValidation.valid) {
      setError(keyValidation.error || 'Clave privada inválida');
      return;
    }

    try {
      await createServerMutation.mutateAsync(formData);

      // Mostrar mensaje de conexión
      setIsConnecting(true);

      // Esperar un momento para que el backend intente conectarse
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Reset form
      setFormData({
        name: '',
        host: '',
        port: 22,
        username: 'root',
        privateKey: '',
        os: 'ubuntu',
        description: '',
      });

      setIsConnecting(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al crear servidor:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Error al agregar el servidor';

      // Proporcionar mensajes más específicos para errores comunes de SSH
      if (errorMessage.includes('authentication methods failed') || errorMessage.includes('clave SSH')) {
        setError('Error de autenticación SSH. Verifica que la clave privada sea correcta y corresponda con la clave pública en el servidor.');
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        setError('No se puede conectar al servidor. Verifica el host, puerto y que el servidor SSH esté funcionando.');
      } else {
        setError(errorMessage);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar Nuevo Servidor" size="lg">
      <form onSubmit={handleSubmit} className="relative space-y-6">
        {/* Connecting Message */}
        {isConnecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f0623]/95 rounded-lg w-full h-full">
            <ConnectionLoading />
          </div>
        )}

        {/* Error Message */}
        {error && !isConnecting && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 animate-fadeIn">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300 mb-2">Error al agregar servidor</p>
                <div className="text-xs text-red-200 whitespace-pre-line leading-relaxed">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Server Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            Nombre del Servidor *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Ej: Web Server 01"
            className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Host and Port */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="host" className="block text-sm font-medium text-gray-300 mb-2">
              Host / IP *
            </label>
            <input
              type="text"
              id="host"
              name="host"
              value={formData.host}
              onChange={handleChange}
              required
              placeholder="192.168.1.10 o example.com"
              className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label htmlFor="port" className="block text-sm font-medium text-gray-300 mb-2">
              Puerto SSH *
            </label>
            <input
              type="number"
              id="port"
              name="port"
              value={formData.port}
              onChange={handleChange}
              required
              min="1"
              max="65535"
              className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Username and OS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Usuario SSH *
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="root"
              className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label htmlFor="os" className="block text-sm font-medium text-gray-300 mb-2">
              Sistema Operativo *
            </label>
            <select
              id="os"
              name="os"
              value={formData.os}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            >
              {OS_OPTIONS.map(option => (
                <option key={option.value} value={option.value} className="bg-[#1a0d2e] text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Private Key */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="privateKey" className="block text-sm font-medium text-gray-300">
              Clave Privada SSH *
            </label>
            {formData.privateKey && (
              <div className="flex items-center gap-1">
                {validatePrivateKey(formData.privateKey).valid ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400">Clave válida</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-400">Clave inválida</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <textarea
              id="privateKey"
              name="privateKey"
              value={formData.privateKey}
              onChange={handleChange}
              required
              rows={8}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA...&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
              className={`w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all font-mono text-xs resize-none ${formData.privateKey
                ? validatePrivateKey(formData.privateKey).valid
                  ? 'border-green-500/50 focus:ring-green-500'
                  : 'border-red-500/50 focus:ring-red-500'
                : 'border-white/20 focus:ring-purple-500'
                }`}
            />
            {formData.privateKey && (
              <div className="absolute bottom-2 right-2 text-[10px] text-gray-400">
                {formData.privateKey.length} caracteres
              </div>
            )}
          </div>
          <div className="mt-2 space-y-3">
            {/* Información general */}
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-2 mb-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs font-semibold text-blue-300">Requisitos de la clave SSH:</p>
              </div>
              <div className="ml-6 space-y-1.5">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-300">
                    Formatos soportados: <span className="text-yellow-300 font-semibold">OpenSSH</span> o <span className="text-yellow-300 font-semibold">PEM</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-300">
                    OpenSSH: <code className="bg-white/10 px-1 rounded text-green-300 text-[10px]">-----BEGIN OPENSSH PRIVATE KEY-----</code>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-300">
                    PEM: <code className="bg-white/10 px-1 rounded text-green-300 text-[10px]">-----BEGIN RSA/EC PRIVATE KEY-----</code>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-300">
                    Sin passphrase (formato PEM antiguo requiere sin contraseña)
                  </p>
                </div>
              </div>
            </div>

            {/* Generar nueva clave */}
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-start gap-2 mb-2">
                <Key className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs font-semibold text-green-300">Generar nueva clave SSH ed25519 (recomendado):</p>
              </div>
              <div className="ml-6 space-y-2">
                <div className="relative group">
                  <code className="block text-[10px] bg-black/40 p-2 rounded text-green-300 font-mono leading-relaxed">
                    ssh-keygen -t ed25519 -N "" -f ~/.ssh/startcode_key
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText('ssh-keygen -t ed25519 -N "" -f ~/.ssh/startcode_key')}
                    className="absolute top-1 right-1 p-1 rounded bg-white/5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copiar comando"
                  >
                    <Copy className="w-3 h-3 text-gray-300" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">
                  Luego copia la clave pública al servidor: <code className="bg-white/10 px-1 rounded">ssh-copy-id -i ~/.ssh/startcode_key.pub user@host</code>
                </p>
                <p className="text-[10px] text-blue-300">
                  💡 <span className="font-semibold">ed25519</span> es más seguro y rápido que RSA
                </p>
              </div>
            </div>

            {/* Advertencia */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-300">
                La clave pública debe estar en <code className="bg-white/10 px-1 rounded text-[10px]">~/.ssh/authorized_keys</code> del servidor remoto
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
            Descripción (Opcional)
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Descripción o notas sobre este servidor..."
            className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={createServerMutation.isPending}
            className="px-6 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createServerMutation.isPending || isConnecting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createServerMutation.isPending || isConnecting ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>{isConnecting ? 'Conectando...' : 'Agregando...'}</span>
              </>
            ) : (
              <>
                <Server className="w-5 h-5" />
                <span>Agregar Servidor</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

