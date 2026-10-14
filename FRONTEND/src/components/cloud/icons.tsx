import type { ReactNode } from 'react';
import type { CloudFileType } from '@typings/cloud.types';

/* Iconos de trazo de la vista de StartCode Cloud. */
const svg = (className: string) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
});

export type CloudIconName = 'cloud' | 'home' | 'chevron' | 'grid' | 'list' | 'filter' | 'close' | 'folder' | 'info' | 'check' | 'upload' | 'search' | 'folderPlus' | 'backup' | 'gear' | 'user' | 'eye' | 'eyeOff' | 'download';

export const CloudIcon = ({ name, className = 'w-4 h-4' }: { name: CloudIconName; className?: string }) => {
  const p = svg(className);
  switch (name) {
    case 'cloud':   return <svg {...p}><path d="M7 18a4 4 0 01-.4-8A6 6 0 0118 10.5a3.75 3.75 0 01-.5 7.5H7z" /></svg>;
    case 'home':    return <svg {...p}><path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" /></svg>;
    case 'chevron': return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case 'grid':    return <svg {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
    case 'list':    return <svg {...p}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>;
    case 'filter':  return <svg {...p}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z" /></svg>;
    case 'close':   return <svg {...p}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case 'info':    return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
    case 'check':   return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'download': return <svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
    case 'upload':  return <svg {...p}><path d="M12 16V5M7 10l5-5 5 5M5 20h14" /></svg>;
    case 'search':  return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'folderPlus': return <svg {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM12 10.5v5M9.5 13h5" /></svg>;
    case 'backup':  return <svg {...p}><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9M10 13h4" /></svg>;
    case 'gear':    return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 01-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 01-2.8-2.9l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9L4.1 7a2 2 0 012.9-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 012.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
    case 'user':    return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>;
    case 'eye':     return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'eyeOff':  return <svg {...p}><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.5 3.4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18" /></svg>;
    case 'folder':  return <svg {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>;
  }
};

/** Carpeta rellena con el tono de marca: la de la rejilla y la de la lista. */
export const FolderGlyph = ({ className = 'w-14 h-12' }: { className?: string }) => (
  <svg viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round"
    aria-hidden className={`text-violet-300 ${className}`}>
    <path d="M2 4a2 2 0 012-2h5l2 2.5h9a2 2 0 012 2V16a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" fill="currentColor" fillOpacity={0.18} />
    <path d="M2 7.5h20" strokeOpacity={0.5} />
  </svg>
);

/* Tono de cada tipo, de las familias ya remapeadas por tema: Word, Excel,
   PowerPoint y PDF llevan el color con el que se reconocen. */
const FILE_TONE: Record<CloudFileType, string> = {
  word:       'text-sky-300',
  excel:      'text-emerald-300',
  powerpoint: 'text-amber-300',
  pdf:        'text-rose-300',
  image:      'text-fuchsia-300',
  video:      'text-pink-300',
  audio:      'text-violet-300',
  archive:    'text-amber-200',
  code:       'text-purple-300',
  text:       'text-white/60',
};

/** Letra de los formatos que se reconocen por ella. */
const FILE_LETTER: Partial<Record<CloudFileType, string>> = {
  word: 'W', excel: 'X', powerpoint: 'P', pdf: 'PDF',
};

/** Dibujo de los demás tipos, dentro de la hoja (viewBox 24 × 28). */
const FILE_GLYPH: Partial<Record<CloudFileType, ReactNode>> = {
  image:   <><circle cx="9" cy="14" r="1.5" /><path d="M6 22l4-4.5 3 3 2-2 3 3.5z" /></>,
  video:   <path d="M10 14v7l6-3.5z" />,
  audio:   <><path d="M14 13v8M14 13l3 1" /><circle cx="12" cy="21" r="2" /></>,
  archive: <><path d="M12 8v1.5M12 11.5V13M12 15v1.5" /><rect x="10.5" y="18" width="3" height="3.5" rx="0.5" /></>,
  code:    <path d="M9.5 14l-3 3.5 3 3.5M14.5 14l3 3.5-3 3.5" />,
  text:    <path d="M7 13h10M7 17h10M7 21h6" />,
};

/** Hoja con la esquina doblada y la marca de su tipo. */
export const FileGlyph = ({ type, size = 'lg' }: { type: CloudFileType; size?: 'xl' | 'lg' | 'sm' }) => {
  const letter = FILE_LETTER[type];
  const lg = size !== 'sm';
  return (
    <span aria-hidden className={`relative inline-flex shrink-0 ${size === 'xl' ? 'w-20 h-24' : lg ? 'w-12 h-14' : 'w-5 h-6'} ${FILE_TONE[type]}`}>
      <svg viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth={lg ? 1.25 : 1.75}
        strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M5 1.5h10l6.5 6.5v17a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 25V3A1.5 1.5 0 015 1.5z"
          fill="currentColor" fillOpacity={0.14} />
        <path d="M15 1.5V8h6.5" />
        {!letter && FILE_GLYPH[type]}
      </svg>
      {letter && (
        <span className={`absolute inset-x-0 font-bold leading-none text-center tracking-tight
          ${size === 'xl' ? 'bottom-5 text-2xl' : lg ? 'bottom-3 text-sm' : 'bottom-1 text-[7px]'}`}>
          {letter}
        </span>
      )}
    </span>
  );
};
