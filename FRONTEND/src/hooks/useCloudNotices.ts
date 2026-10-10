import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudNotice } from '@typings/cloud.types';

/** Lo que dura un aviso informativo. */
const INFO_MS = 5_000;
/** La confirmación de una carga se queda 10 s. */
const DONE_MS = 10_000;

/* Contador y no `crypto.randomUUID`: este no existe fuera de contexto seguro (panel por http). */
let seq = 0;
const newId = () => `cloud-notice-${++seq}`;

/** Lo que la carga va informando al aviso. */
export interface UploadNoticeControl {
  /** Bytes enviados en total. */
  progress: (loaded: number) => void;
  done: () => void;
  /** Quita el aviso de progreso y muestra el error. */
  fail: (message: string) => void;
}

/**
 * Avisos de la vista Cloud: informativos (5 s) y de carga, con el progreso
 * real que va reportando la subida a la nube.
 */
export function useCloudNotices() {
  const [notices, setNotices] = useState<CloudNotice[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  /* Al salir de la vista no queda ningún temporizador vivo. */
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(t => clearTimeout(t)); pending.clear(); };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);

  const dismiss = useCallback((id: string) => setNotices(prev => prev.filter(n => n.id !== id)), []);

  const info = useCallback((title: string, description?: string) => {
    const id = newId();
    setNotices(prev => [...prev, { id, kind: 'info', title, description }]);
    later(() => dismiss(id), INFO_MS);
  }, [later, dismiss]);

  /** Abre el aviso de una carga y devuelve con qué actualizarlo. */
  const startUpload = useCallback((
    upload: { label: string; destination: string; fileCount: number; bytes: number },
  ): UploadNoticeControl => {
    const id = newId();
    setNotices(prev => [...prev, { id, kind: 'upload', ...upload, progress: 0, status: 'uploading' }]);
    const update = (change: (n: Extract<CloudNotice, { kind: 'upload' }>) => CloudNotice) =>
      setNotices(prev => prev.map(n => (n.id === id && n.kind === 'upload' ? change(n) : n)));
    return {
      progress: loaded => update(n => ({ ...n, progress: n.bytes > 0 ? Math.min(0.99, loaded / n.bytes) : 0 })),
      done: () => {
        update(n => ({ ...n, progress: 1, status: 'done' }));
        later(() => dismiss(id), DONE_MS);
      },
      fail: message => {
        dismiss(id);
        info('No se pudo completar la carga', message);
      },
    };
  }, [later, dismiss, info]);

  return { notices, info, startUpload, dismiss };
}
