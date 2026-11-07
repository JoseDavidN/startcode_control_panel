import { useCallback, useState } from 'react';
import { notify } from '@services/notification.service';
import { MAX_QUERY_NAME, MAX_SAVED_QUERIES, loadQueries, sameName, writeQueries, type SavedQuery } from '@lib/sqlQueries';

/** Consultas guardadas de una conexión. La vista se monta por conexión (`key`). */
export function useSavedQueries(connectionId: string) {
  const [queries, setQueries] = useState<SavedQuery[]>(() => loadQueries(connectionId));

  const commit = useCallback((next: SavedQuery[]) => {
    if (!writeQueries(connectionId, next)) {
      notify.error('No se pudo guardar', 'El almacenamiento de la app está lleno. Elimina consultas que ya no uses.');
      return false;
    }
    setQueries(next);
    return true;
  }, [connectionId]);

  /** Guarda con ese nombre; si ya hay una que se llama igual, la reemplaza. */
  const saveAs = useCallback((rawName: string, sql: string, schema: string | null): SavedQuery | null => {
    const name = rawName.trim().slice(0, MAX_QUERY_NAME);
    const existing = queries.find(q => sameName(q.name, name));
    if (!existing && queries.length >= MAX_SAVED_QUERIES) {
      notify.error('No se pudo guardar', `Se admiten hasta ${MAX_SAVED_QUERIES} consultas por conexión.`);
      return null;
    }
    const saved: SavedQuery = {
      id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      sql,
      schema,
      updatedAt: Date.now(),
    };
    return commit([saved, ...queries.filter(q => q.id !== saved.id)]) ? saved : null;
  }, [queries, commit]);

  const update = useCallback((id: string, sql: string, schema: string | null) =>
    commit(queries.map(q => (q.id === id ? { ...q, sql, schema, updatedAt: Date.now() } : q))), [queries, commit]);

  /** False si ya hay otra con ese nombre. */
  const rename = useCallback((id: string, rawName: string) => {
    const name = rawName.trim().slice(0, MAX_QUERY_NAME);
    if (queries.some(q => q.id !== id && sameName(q.name, name))) return false;
    return commit(queries.map(q => (q.id === id ? { ...q, name } : q)));
  }, [queries, commit]);

  const remove = useCallback((id: string) => commit(queries.filter(q => q.id !== id)), [queries, commit]);

  return { queries, saveAs, update, rename, remove };
}
