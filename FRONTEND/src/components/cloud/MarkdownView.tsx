import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';

/* ── Vista previa de Markdown ─────────────────────────────────────────
   react-markdown arma elementos de React (nunca inserta HTML crudo: el
   HTML que traiga el archivo se ignora) y remark-gfm añade tablas, listas
   de tareas, tachado y enlaces automáticos. Cada elemento lleva las clases
   del sistema de diseño en vez de una hoja de estilos de prosa. */

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-white mt-2 mb-4 pb-2 border-b border-line">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold text-white mt-7 mb-3 pb-1.5 border-b border-line">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold text-white mt-6 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 className="text-base font-semibold text-white mt-5 mb-2">{children}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-semibold text-white mt-4 mb-1.5">{children}</h5>,
  h6: ({ children }) => <h6 className="text-sm font-semibold text-white/70 mt-4 mb-1.5">{children}</h6>,
  p: ({ children }) => <p className="my-3">{children}</p>,
  a: ({ href, children }) => (
    /* En el navegador del sistema (plugin `opener`): nunca se navega dentro de la app. */
    <a href={href} onClick={e => { e.preventDefault(); if (href && /^(https?|mailto):/i.test(href)) void openUrl(href).catch(() => undefined); }} className="text-violet-300 underline underline-offset-2 hover:text-violet-200">{children}</a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  del: ({ children }) => <del className="text-white/50">{children}</del>,
  ul: ({ children, className }) => (
    <ul className={`my-3 pl-6 space-y-1 ${className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc marker:text-violet-300'}`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-3 pl-6 space-y-1 list-decimal marker:text-white/45">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  input: ({ checked }) => (
    <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-2 align-middle accent-violet-500" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 pl-4 border-l-2 border-violet-400/50 text-white/65 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-line" />,
  pre: ({ children }) => (
    <pre className="my-4 p-4 rounded-xl bg-tint-sunken border border-line overflow-x-auto scroll-thin text-xs leading-relaxed font-mono text-white/85">{children}</pre>
  ),
  code: ({ className, children }) =>
    /* En bloque (dentro de <pre>) trae `language-…` o varias líneas; en línea, ninguna de las dos. */
    className?.startsWith('language-') || (typeof children === 'string' && children.includes('\n'))
      ? <code className={className}>{children}</code>
      : <code className="px-1.5 py-0.5 rounded-md bg-tint-active font-mono text-[0.85em] text-white/90">{children}</code>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto scroll-thin rounded-xl border border-line">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-tint-active">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="px-3 py-2 text-left font-semibold text-white border-b border-line">{children}</th>,
  td: ({ children, style }) => <td style={style} className="px-3 py-2 border-t border-line align-top">{children}</td>,
  /* La CSP de la app no carga imágenes de fuera y las rutas relativas no
     apuntan a nada: se muestra qué imagen era. */
  img: ({ alt, src }) => (
    <span title={src} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-tint-active text-xs text-white/55">
      Imagen{alt ? `: ${alt}` : ''}
    </span>
  ),
};

export const MarkdownView = ({ text, truncated }: { text: string; truncated: boolean }) => {
  const [source, setSource] = useState(false);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Modo de vista" className="flex justify-end">
        <div className="glass-soft rounded-xl h-9 flex items-center gap-1 p-1">
          {([[false, 'Vista'], [true, 'Código']] as const).map(([mode, label]) => (
            <button key={label} type="button" role="radio" aria-checked={source === mode} onClick={() => setSource(mode)}
              className={`mo-tab h-7 px-3 rounded-lg text-xs font-medium ${source === mode
                ? 'mo-tab-on grad-brand text-white elev-brand-sm'
                : 'text-white/55 hover:text-white hover:bg-tint-hover'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {source ? (
        <pre className="p-4 rounded-xl bg-tint-sunken border border-line text-xs font-mono leading-relaxed text-white/85 whitespace-pre-wrap break-words select-text">{text || ' '}</pre>
      ) : (
        <article className="max-w-3xl mx-auto py-1 text-sm leading-relaxed text-white/80 break-words select-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>{text}</ReactMarkdown>
        </article>
      )}
      {truncated && <p className="text-[11px] text-white/40">El archivo es muy largo: se muestra el principio. Descárgalo para verlo completo.</p>}
    </div>
  );
};
