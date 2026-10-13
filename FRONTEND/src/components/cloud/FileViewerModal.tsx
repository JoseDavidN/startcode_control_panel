import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Modal } from '@components/common/Modal';
import { MenuIcon } from '@components/common/ContextMenu';
import { FileGlyph } from '@components/cloud/icons';
import { MarkdownView } from '@components/cloud/MarkdownView';
import { ImageView } from '@components/cloud/ImageView';
import { VideoView } from '@components/cloud/VideoView';
import { readDocx, readXlsx, SHEET_MAX_COLS, SHEET_MAX_ROWS, UnsupportedFileError } from '@lib/fileViewer/office';
import type { DocBlock, Sheet } from '@lib/fileViewer/office';
import { openPdf } from '@lib/fileViewer/pdf';
import { CLOUD_FILE_TYPE_LABELS, formatBytes } from '@utils/cloud';
import type { CloudFile, CloudStream } from '@typings/cloud.types';

/** Más allá de esto un texto se corta: pintarlo entero congelaría la ventana. */
const TEXT_MAX_CHARS = 500_000;

type Loaded =
  | { kind: 'doc'; blocks: DocBlock[] }
  | { kind: 'sheets'; sheets: Sheet[] }
  | { kind: 'pdf'; doc: PDFDocumentProxy }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'markdown'; text: string; truncated: boolean }
  /* URL del blob: se libera al cerrar el lector o cambiar de imagen. */
  | { kind: 'image'; url: string }
  /* Se reproduce desde la nube mientras carga: no se descarga el video entero. */
  | { kind: 'video'; stream: CloudStream };

async function load(file: CloudFile, blob: Blob): Promise<Loaded> {
  switch (file.type) {
    case 'word': return { kind: 'doc', blocks: await readDocx(blob) };
    case 'excel': return { kind: 'sheets', sheets: await readXlsx(blob) };
    case 'pdf': return { kind: 'pdf', doc: await openPdf(blob) };
    case 'image': {
      /* Un SVG sin su tipo MIME no se pinta en <img>; el resto se reconoce por su contenido. */
      const typed = /\.svg$/i.test(file.name) && blob.type !== 'image/svg+xml' ? new Blob([blob], { type: 'image/svg+xml' }) : blob;
      return { kind: 'image', url: URL.createObjectURL(typed) };
    }
    default: {
      const text = await blob.text();
      /* .md se interpreta; el resto del texto y el código, tal cual. */
      const kind = /\.(md|markdown)$/i.test(file.name) ? 'markdown' : 'text';
      return { kind, text: text.slice(0, TEXT_MAX_CHARS), truncated: text.length > TEXT_MAX_CHARS };
    }
  }
}

/** Por qué no se pudo reproducir, según cómo lo servía la nube. */
function videoError(stream: CloudStream): string {
  if (stream.ffmpeg === false) return 'Este formato necesita conversión y el servidor de la nube no tiene ffmpeg instalado.';
  if (stream.mode === 'transcode') return 'No se pudo convertir el video. Si la nube está convirtiendo otros, inténtalo en un momento.';
  if (stream.mode === 'remux') return 'No se pudo preparar el video para reproducirlo.';
  return 'Este video usa un formato o códec que el reproductor no admite.';
}

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="py-20 flex flex-col items-center justify-center text-center gap-3 px-6">{children}</div>
);

/* ── Word: bloques con su jerarquía; el formato fino se simplifica. ── */
const DocView = ({ blocks }: { blocks: DocBlock[] }) => {
  const STYLE = { title: 'text-2xl font-bold mb-4', h1: 'text-xl font-semibold mt-6 mb-2', h2: 'text-lg font-semibold mt-5 mb-2', h3: 'text-base font-semibold mt-4 mb-1.5', normal: 'my-2' };
  return (
    <article className="max-w-3xl mx-auto py-2 text-sm leading-relaxed text-white/85 select-text">
      {blocks.map((b, i) => {
        if (b.kind === 'table') {
          return (
            <div key={i} className="my-4 overflow-x-auto scroll-thin rounded-xl border border-line">
              <table className="w-full text-sm border-collapse">
                <tbody className="divide-y divide-line">
                  {b.rows.map((row, r) => (
                    <tr key={r} className={r === 0 ? 'bg-tint-active font-semibold text-white' : ''}>
                      {row.map((cell, c) => <td key={c} className="px-3 py-2 align-top border-r border-line last:border-r-0">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const runs = b.runs.map((r, j) => (
          <span key={j} className={`whitespace-pre-wrap ${r.bold ? 'font-semibold text-white' : ''} ${r.italic ? 'italic' : ''} ${r.underline ? 'underline' : ''}`}>{r.text}</span>
        ));
        if (b.runs.length === 0) return <div key={i} className="h-3" />;
        if (b.list) return <p key={i} className="my-1 pl-5 relative"><span className="absolute left-1 text-violet-300">•</span>{runs}</p>;
        return <p key={i} className={`${STYLE[b.style]} ${b.style !== 'normal' ? 'text-white' : ''}`}>{runs}</p>;
      })}
    </article>
  );
};

/* ── Excel: una pestaña por hoja y la rejilla con letras y números. ── */
const columnName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : columnName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

const SheetsView = ({ sheets }: { sheets: Sheet[] }) => {
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  if (!sheet) return <Centered><p className="text-sm text-white/55">El libro no tiene hojas.</p></Centered>;
  const width = Math.max(1, ...sheet.rows.map(r => r.length));
  const capped = sheet.rows.length >= SHEET_MAX_ROWS || width >= SHEET_MAX_COLS;
  return (
    <div className="flex flex-col gap-3">
      {sheets.length > 1 && (
        <div role="tablist" className="flex items-center gap-1 flex-wrap">
          {sheets.map((s, i) => (
            <button key={s.name} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
              className={`mo-tab h-8 px-3 rounded-lg text-xs font-medium ${i === active
                ? 'mo-tab-on grad-brand text-white elev-brand-sm'
                : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[62vh] overflow-auto scroll-thin scroll-layer rounded-xl border border-line">
        <table className="data-table w-max min-w-full text-xs font-mono border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 sticky-cell w-12 h-8 border-b border-r border-line" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} className="sticky top-0 z-10 sticky-cell px-3 h-8 text-center text-white/45 font-semibold border-b border-line">{columnName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 sticky-cell px-3 h-8 text-right text-white/35 border-r border-line tabular-nums">{r + 1}</td>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className={`px-3 h-8 whitespace-nowrap max-w-[320px] truncate ${/^-?\d+([.,]\d+)?$/.test(row[c] ?? '') ? 'text-right tabular-nums' : ''} text-white/80`}>
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {capped && <p className="text-[11px] text-white/40">Vista previa limitada a {SHEET_MAX_ROWS} filas y {SHEET_MAX_COLS} columnas. Descarga el archivo para verlo completo.</p>}
    </div>
  );
};

/* ── PDF: cada página en un canvas al ancho del lector, una tras otra. ── */
const PdfView = ({ doc }: { doc: PDFDocumentProxy }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const width = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.className = 'block rounded-lg elev-raised';
        canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages}`);
        el.appendChild(canvas);
        task = page.render({ canvas, viewport });
        try { await task.promise; } catch { /* cancelado al cerrar */ }
      }
    })();
    return () => { cancelled = true; task?.cancel(); el.replaceChildren(); };
  }, [doc]);
  return <div ref={host} className="max-w-3xl mx-auto flex flex-col gap-4" />;
};

const TextView = ({ text, truncated }: { text: string; truncated: boolean }) => (
  <div className="space-y-2">
    <pre className="p-4 rounded-xl bg-tint-sunken border border-line text-xs font-mono leading-relaxed text-white/85 whitespace-pre-wrap break-words select-text">{text || ' '}</pre>
    {truncated && <p className="text-[11px] text-white/40">El texto es muy largo: se muestra el principio. Descarga el archivo para verlo completo.</p>}
  </div>
);

/* ── Lector de archivos de Cloud ──────────────────────────────────────
   Modal grande con el nombre en la cabecera y Descargar junto a Cerrar.
   Word, Excel, PDF, imágenes, texto y código; el contenido se lee en la app.
   Con `siblings`, las imágenes se recorren con las flechas. */
export const FileViewerModal = ({
  file, siblings, getContent, getStream, seekPoint, onDownload, onSelect, onClose,
}: {
  file: CloudFile | null;
  /** Imágenes de la carpeta, en el orden en que se ven. */
  siblings?: CloudFile[];
  getContent: (file: CloudFile) => Promise<Blob>;
  /** Videos: cómo reproducirlos mientras cargan, en lugar de bajar el archivo. */
  getStream?: (file: CloudFile) => Promise<CloudStream>;
  /** En `remux`/`transcode`: segundo real desde el que empezará al saltar. */
  seekPoint?: (stream: CloudStream, t: number) => Promise<number>;
  onDownload: (file: CloudFile) => void;
  onSelect?: (file: CloudFile) => void;
  onClose: () => void;
}) => {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'error'; message: string }>({ status: 'loading' });

  useEffect(() => {
    if (!file) return;
    let alive = true;
    /* El PDF abierto se libera al cerrar el lector o cambiar de archivo. */
    let pdf: PDFDocumentProxy | null = null;
    let url: string | null = null;
    setState({ status: 'loading' });
    const loading: Promise<Loaded> = file.type === 'video' && getStream
      ? getStream(file).then(stream => ({ kind: 'video', stream }))
      : getContent(file).then(blob => load(file, blob));
    loading
      .then(data => {
        if (data.kind === 'pdf') pdf = data.doc;
        if (data.kind === 'image') url = data.url;
        if (alive) setState({ status: 'ready', data });
        else { void pdf?.loadingTask.destroy(); if (url) URL.revokeObjectURL(url); }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        /* El motivo real va al mensaje: sin él no hay forma de saber por qué falló un lector. */
        console.error(`Lector de Cloud (${file.name}):`, err);
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        const message = err instanceof UnsupportedFileError ? err.message : `No se pudo leer el archivo${detail}.`;
        setState({ status: 'error', message });
      });
    return () => { alive = false; void pdf?.loadingTask.destroy(); if (url) URL.revokeObjectURL(url); };
  }, [file, getContent, getStream]);

  if (!file) return null;

  /* Navegación entre las imágenes de la carpeta (en círculo). */
  const index = siblings?.findIndex(f => f.id === file.id) ?? -1;
  const canStep = file.type === 'image' && onSelect && siblings && index >= 0 && siblings.length > 1;
  const step = (d: number) => () => { if (canStep) onSelect(siblings[(index + d + siblings.length) % siblings.length]); };

  const actions = (
    <button type="button" onClick={() => onDownload(file)}
      className="inline-flex items-center gap-2 h-8 px-3 rounded-lg glass-soft row-hit text-white/80 hover:text-white text-xs font-medium">
      <MenuIcon name="download" className="w-3.5 h-3.5" />
      Descargar
    </button>
  );

  return (
    <Modal isOpen onClose={onClose} title={file.name} size="xl" actions={actions} tall>
      <div className="flex items-center gap-2 mb-4 text-xs text-white/45">
        <FileGlyph type={file.type} size="sm" />
        <span>{CLOUD_FILE_TYPE_LABELS[file.type]}</span>
        <span className="text-white/20">·</span>
        <span className="font-mono">{formatBytes(file.size)}</span>
      </div>

      {state.status === 'loading' && (
        <Centered>
          <div className="w-9 h-9 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          <p className="text-sm text-white/50">Abriendo {file.name}…</p>
        </Centered>
      )}
      {state.status === 'error' && (
        <Centered>
          <FileGlyph type={file.type} />
          <p className="text-sm font-medium text-white/70">Sin vista previa</p>
          <p className="text-xs text-white/45 max-w-sm">{state.message} Puedes descargarlo para abrirlo con su programa.</p>
        </Centered>
      )}
      {state.status === 'ready' && (
        <Fragment key={file.id}>
          {state.data.kind === 'doc' && <DocView blocks={state.data.blocks} />}
          {state.data.kind === 'sheets' && <SheetsView sheets={state.data.sheets} />}
          {state.data.kind === 'pdf' && <PdfView doc={state.data.doc} />}
          {state.data.kind === 'text' && <TextView text={state.data.text} truncated={state.data.truncated} />}
          {state.data.kind === 'markdown' && <MarkdownView text={state.data.text} truncated={state.data.truncated} />}
          {state.data.kind === 'video' && (() => {
            const stream = state.data.stream;
            const live = stream.mode !== 'direct';
            return (
              <div className="h-[calc(100%-2rem)]">
                <VideoView src={stream.url} name={file.name}
                  live={live ? { duration: stream.duration, seek: t => (seekPoint ? seekPoint(stream, t) : Promise.resolve(t)) } : undefined}
                  badge={stream.mode === 'transcode' ? 'Convertido al vuelo' : undefined}
                  onError={() => setState({ status: 'error', message: videoError(stream) })} />
              </div>
            );
          })()}
          {state.data.kind === 'image' && (
            /* Ocupa el alto del lector menos la línea de tipo y tamaño. */
            <div className="h-[calc(100%-2rem)]">
              <ImageView src={state.data.url} name={file.name}
                position={canStep ? { index, total: siblings.length } : undefined}
                onPrev={canStep ? step(-1) : undefined} onNext={canStep ? step(1) : undefined}
                onError={() => setState({ status: 'error', message: 'Este formato de imagen no se puede mostrar aquí.' })} />
            </div>
          )}
        </Fragment>
      )}
    </Modal>
  );
};
