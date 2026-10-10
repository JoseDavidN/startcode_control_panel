import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from '@utils/constants';
import { CLOUD_SECTIONS, MAX_PINNED_FOLDERS } from '@utils/cloud';
import type { CloudSection } from '@typings/cloud.types';

export type PinnedBySection = Record<CloudSection, string[]>;

const empty = (): PinnedBySection =>
  Object.fromEntries(CLOUD_SECTIONS.map(s => [s.id, []])) as unknown as PinnedBySection;

const ids = (v: unknown) =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_PINNED_FOLDERS) : []);

function readPinned(): PinnedBySection {
  const result = empty();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.CLOUD_PINNED) ?? '{}');
    /* Antes de Backups se guardaba solo la lista de Home. */
    if (Array.isArray(parsed)) return { ...result, home: ids(parsed) };
    if (parsed && typeof parsed === 'object') {
      for (const { id } of CLOUD_SECTIONS) result[id] = ids((parsed as Record<string, unknown>)[id]);
    }
  } catch { /* guardado corrupto: sin fijadas */ }
  return result;
}

/**
 * Carpetas fijadas en la columna de navegación de Cloud, por sección (ids,
 * en el orden en que se fijaron, máximo `MAX_PINNED_FOLDERS` en cada una).
 * Se guardan en el equipo hasta que la nube tenga backend.
 */
export function useCloudPinned() {
  const [pinned, setPinned] = useState<PinnedBySection>(readPinned);

  const save = useCallback((section: CloudSection, update: (prev: string[]) => string[]) => setPinned(prev => {
    const list = update(prev[section]);
    if (list === prev[section]) return prev;
    const next = { ...prev, [section]: list };
    localStorage.setItem(STORAGE_KEYS.CLOUD_PINNED, JSON.stringify(next));
    return next;
  }), []);

  const pin = useCallback((section: CloudSection, id: string) =>
    save(section, prev => (prev.includes(id) || prev.length >= MAX_PINNED_FOLDERS ? prev : [...prev, id])), [save]);
  const unpin = useCallback((section: CloudSection, id: string) =>
    save(section, prev => (prev.includes(id) ? prev.filter(p => p !== id) : prev)), [save]);
  /** Deja solo las que siguen existiendo, para que una carpeta perdida no ocupe sitio. */
  const retain = useCallback((section: CloudSection, keep: string[]) =>
    save(section, prev => (prev.every(p => keep.includes(p)) ? prev : prev.filter(p => keep.includes(p)))), [save]);

  return { pinned, pin, unpin, retain };
}
