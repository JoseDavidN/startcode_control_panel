/* Iconos de trazo de la vista de gestión de bases de datos. */
const svg = (className: string) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
});

export type DbIconName =
  | 'database' | 'table' | 'view' | 'column' | 'key' | 'chevron' | 'chevronL'
  | 'play' | 'refresh' | 'alert' | 'check' | 'download' | 'chevronDown' | 'shield' | 'warn' | 'trigger' | 'index' | 'procedure' | 'search' | 'folder' | 'eyeOff' | 'copy' | 'edit' | 'close' | 'trash';

export const DbIcon = ({ name, className = 'w-4 h-4' }: { name: DbIconName; className?: string }) => {
  const p = svg(className);
  switch (name) {
    case 'database': return <svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
    case 'table':    return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></svg>;
    case 'view':     return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'column':   return <svg {...p}><path d="M5 7h14M5 12h14M5 17h9" /></svg>;
    case 'key':      return <svg {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></svg>;
    case 'chevron':  return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case 'chevronL': return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    case 'play':     return <svg {...p}><path d="M7 4l13 8-13 8V4z" /></svg>;
    case 'refresh':  return <svg {...p}><path d="M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M3 21v-5h5" /></svg>;
    case 'alert':    return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16v.01" /></svg>;
    case 'download': return <svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
    case 'chevronDown': return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case 'shield':   return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" /></svg>;
    case 'warn':     return <svg {...p}><path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" /></svg>;
    case 'trigger':  return <svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>;
    case 'index':    return <svg {...p}><path d="M4 6h16M4 12h10M4 18h6M18 14v6M15 17h6" /></svg>;
    case 'procedure': return <svg {...p}><path d="M8 4H6a2 2 0 00-2 2v4l-2 2 2 2v4a2 2 0 002 2h2M16 4h2a2 2 0 012 2v4l2 2-2 2v4a2 2 0 01-2 2h-2" /></svg>;
    case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'folder':   return <svg {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>;
    case 'eyeOff':   return <svg {...p}><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.5 3.4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18" /></svg>;
    case 'copy':     return <svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></svg>;
    case 'edit':     return <svg {...p}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" /><path d="M14 7l3 3" /></svg>;
    case 'close':    return <svg {...p}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case 'check':    return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'trash':    return <svg {...p}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>;
  }
};
