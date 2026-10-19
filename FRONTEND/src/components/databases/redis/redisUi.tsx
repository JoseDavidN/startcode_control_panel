import React from 'react';

/* Piezas comunes del explorador de Redis. */

/* Etiqueta corta del tipo. El tipo se distingue por el texto, no por color. */
const SHORT: Record<string, string> = { string: 'STR', hash: 'HASH', list: 'LIST', set: 'SET', zset: 'ZSET', stream: 'STREAM' };

export const TypeBadge = ({ type }: { type: string }) => (
  <span className="shrink-0 w-14 text-center text-[10px] font-semibold tracking-wider px-1 py-0.5 rounded-md bg-tint-active text-white/60 ring-1 ring-hairline font-mono">
    {SHORT[type] ?? type.slice(0, 6).toUpperCase()}
  </span>
);

/** Campo de una línea del explorador (más bajo que el de los formularios). */
export const Field = ({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className={`glass-input rounded-lg h-8 flex items-center px-2.5 min-w-0 ${className}`}>
    <input {...props} className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono placeholder:text-white/30 text-white/90" />
  </div>
);

