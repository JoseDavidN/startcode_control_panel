import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Botones de la cabecera, a la izquierda del de cerrar. */
  actions?: React.ReactNode;
  /** Ocupa todo el alto disponible (con el margen de arriba y abajo) aunque el contenido sea corto. */
  tall?: boolean;
  /** Si es false no se cierra con Escape, el fondo ni el botón (que no se muestra): el contenido decide cuándo. */
  dismissable?: boolean;
}

const sizeMap = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', actions, tall = false, dismissable = true }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissable) onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, dismissable]);

  if (!isOpen) return null;

  /* Se monta en el body con un portal, no donde se use.
     `.glass` lleva `backdrop-filter`, y un ancestro con filtro crea bloque
     contenedor: dentro de una tarjeta glass, un `position: fixed` deja de
     medirse contra la ventana y el modal queda encerrado en la tarjeta. */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 md:px-6 py-12">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fadeIn"
        onClick={dismissable ? onClose : undefined}
      />

      {/* Modal — nunca más alto que la ventana: el py-12 del contenedor deja
          aire arriba y abajo y max-h-full lo respeta. Flex-col: la cabecera
          queda fija y el cuerpo desplaza. */}
      <div
        className={`relative w-full ${sizeMap[size]} ${tall ? 'h-full' : ''} max-h-full flex flex-col glass elev-modal grain rounded-2xl animate-slideUp`}
      >
        {/* Header — never scrolls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="text-lg font-semibold tracking-tight text-grad-brand truncate min-w-0" title={title}>{title}</h2>
          <div className="flex items-center gap-2 shrink-0 ml-4">
          {actions}
          {dismissable && <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg glass-soft text-white/50 hover:text-white/90 row-hit flex items-center justify-center transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="p-6 overflow-y-auto modal-scroll flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
