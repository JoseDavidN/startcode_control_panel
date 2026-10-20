import { useEffect, useRef, useState } from 'react';
import { FileGlyph } from '@components/cloud/icons';
import { cloudApi } from '@services/cloud.api';
import type { CloudFile, CloudSection } from '@typings/cloud.types';

/* Miniaturas ya pedidas (URL de blob, o null si el archivo no tiene): sobreviven
   al cambiar de carpeta. La clave lleva la fecha: un archivo cambiado pide otra. */
const CACHE_MAX = 400;
const cache = new Map<string, Promise<string | null>>();
/* Pocas a la vez: el resto espera turno y la carpeta no satura la red. */
const MAX_PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>(resolve => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function thumbnailUrl(section: CloudSection, file: CloudFile): Promise<string | null> {
  const key = `${section}\0${file.id}\0${file.size}\0${file.modifiedAt}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = limited(() => cloudApi.thumbnail(section, file.id))
      .then(blob => URL.createObjectURL(blob), () => null);
    cache.set(key, hit);
    if (cache.size > CACHE_MAX) {
      const [oldKey, oldUrl] = cache.entries().next().value as [string, Promise<string | null>];
      cache.delete(oldKey);
      void oldUrl.then(url => { if (url) URL.revokeObjectURL(url); });
    }
  }
  return hit;
}

const PlayBadge = ({ small }: { small: boolean }) => (
  <span aria-hidden className={`absolute inset-0 m-auto glass-media rounded-full border border-hairline flex items-center justify-center text-white
    ${small ? 'w-3.5 h-3.5' : 'w-9 h-9'}`}>
    <svg viewBox="0 0 24 24" fill="currentColor" className={small ? 'w-2 h-2 ml-px' : 'w-4 h-4 ml-0.5'}><path d="M8 5.5v13l11-6.5z" /></svg>
  </span>
);

/**
 * Imagen o portada de un video en lugar del icono del tipo. Se pide cuando
 * entra en pantalla; mientras carga, o si no se puede sacar, queda el icono.
 * `lg`: cabecera del mosaico (ocupa el ancho); `sm`: fila de la lista.
 */
export const FileThumb = ({ file, section, size }: { file: CloudFile; section: CloudSection; size: 'lg' | 'sm' }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const small = size === 'sm';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    /* Sin vaciar antes: la caché responde enseguida y la imagen no parpadea al refrescar el árbol. */
    void thumbnailUrl(section, file).then(u => { if (alive) { setUrl(u); setFailed(!u); } });
    return () => { alive = false; };
  }, [visible, section, file]);

  const shown = Boolean(url) && !failed;
  return (
    <span ref={ref} className={`relative shrink-0 flex items-center justify-center overflow-hidden
      ${small ? 'w-6 h-6 rounded-md' : 'w-full h-24 rounded-lg'} ${shown ? 'bg-tint-sunken border border-hairline-soft' : ''}`}>
      {shown && url ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)}
          className="w-full h-full object-cover animate-fadeIn" />
      ) : (
        <FileGlyph type={file.type} size={small ? 'sm' : 'lg'} />
      )}
      {shown && file.type === 'video' && <PlayBadge small={small} />}
    </span>
  );
};
