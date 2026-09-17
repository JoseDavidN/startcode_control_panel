import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /* Se monta en el body con un portal, no donde se use.
     `.glass` lleva `backdrop-filter`, y un ancestro con filtro crea bloque
     contenedor: dentro de una tarjeta glass, un `position: fixed` deja de
     medirse contra la ventana y el modal queda encerrado en la tarjeta. */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal — max 88vh, flex-col so header stays fixed and body scrolls */}
      <div
        className={`relative w-full ${sizeMap[size]} max-h-[88vh] flex flex-col glass grain rounded-2xl animate-slideUp`}
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Header — never scrolls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2 className="text-lg font-semibold tracking-tight text-grad-brand">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg glass-soft text-white/50 hover:text-white/90 hover:bg-white/[0.08] flex items-center justify-center transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
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
