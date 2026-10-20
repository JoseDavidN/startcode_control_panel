import React from 'react';
import type { HostKeyInfo } from '@typings/hostKey.types';

/** Algoritmo y huella SHA256 de una clave de host, seleccionables para copiarlos. */
export const HostKeyBlock: React.FC<{ label: string; info: HostKeyInfo; tone: 'muted' | 'danger' }> = ({ label, info, tone }) => (
  <div className={`glass-soft rounded-xl p-3 ${tone === 'danger' ? 'border border-rose-400/25' : ''}`}>
    <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1.5">{label}</div>
    <div className="text-[11px] font-mono text-white/55">{info.algorithm ?? 'algoritmo desconocido'}</div>
    <div className={`text-sm font-mono break-all select-text ${tone === 'danger' ? 'text-rose-300' : 'text-white/85'}`}>
      {info.fingerprint}
    </div>
  </div>
);
