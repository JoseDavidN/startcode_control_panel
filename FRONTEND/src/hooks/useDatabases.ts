// src/hooks/useDatabases.ts
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { databasesApi } from '@services/databases.api';
import { useAuth } from '@hooks/useAuth';
import type { DatabaseConnection, DatabaseConnectionForm, SchemaSection } from '@typings/database.types';
import { MANAGEABLE_ENGINES } from '@typings/database.types';
import { removeEditors } from '@lib/sqlEditors';
import { removeQueries } from '@lib/sqlQueries';

export const DATABASE_KEYS = {
	list: ['databases'] as const,
	one: (id: string) => ['databases', id] as const,
	/* Con la sesión en la clave: al reconectar, lo pedido con la anterior se vuelve a pedir. */
	schemas: (id: string, sessionId: string) => ['databases', id, 'session', sessionId, 'schemas'] as const,
	section: (id: string, sessionId: string, schema: string, section: SchemaSection) =>
		['databases', id, 'session', sessionId, 'schemas', schema, section] as const,
	audit: (id: string) => ['databases', id, 'audit'] as const,
};

/* Sin refresco periódico: la lista solo lee las filas guardadas; ninguna
   tarjeta conecta a su base. */
/** Conexiones del usuario. */
export function useDatabaseConnections() {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: DATABASE_KEYS.list,
		queryFn: () => databasesApi.list(),
		enabled: isAuthenticated,
		retry: false,
		staleTime: 1000 * 30,
	});
}

/** Una conexión; arranca con lo que ya haya en la lista para pintar sin esperar. */
export function useDatabaseConnection(id: string | undefined) {
	const { isAuthenticated } = useAuth();
	const queryClient = useQueryClient();

	return useQuery({
		queryKey: DATABASE_KEYS.one(id ?? ''),
		queryFn: () => databasesApi.get(id!),
		enabled: isAuthenticated && Boolean(id),
		retry: false,
		initialData: () => queryClient.getQueryData<DatabaseConnection[]>(DATABASE_KEYS.list)?.find(c => c.id === id),
		staleTime: 1000 * 30,
	});
}

export type DatabaseSessionStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

export interface DatabaseSessionState {
	status: DatabaseSessionStatus;
	sessionId: string | null;
	error: string | null;
}

/** El backend cerró la sesión (salida de otra pestaña, inactividad, conexión editada). */
export const isSessionClosedError = (err: unknown) => (err as { code?: string })?.code === 'DB_SESSION_CLOSED';

/**
 * Conexión de la vista de consultas: se abre al montar la vista y se cierra
 * al desmontarla o al cerrar la ventana. Es la única conexión a la base que
 * mantiene el panel; fuera de esta vista no se conecta ni se comprueba nada.
 */
export function useDatabaseSession(conn: DatabaseConnection | undefined) {
	const queryClient = useQueryClient();
	const id = conn?.id;
	const manageable = conn ? MANAGEABLE_ENGINES.includes(conn.engine) : false;
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<DatabaseSessionState>({ status: 'idle', sessionId: null, error: null });

	useEffect(() => {
		if (!id || !manageable) return;
		let cancelled = false;
		let opened: string | null = null;
		setState({ status: 'connecting', sessionId: null, error: null });

		databasesApi.openSession(id)
			.then(({ sessionId, version }) => {
				/* La vista se cerró mientras conectaba: no dejar la sesión huérfana. */
				if (cancelled) { databasesApi.closeSession(id, sessionId); return; }
				opened = sessionId;
				setState({ status: 'open', sessionId, error: null });
				if (version) {
					const withVersion = (c: DatabaseConnection) => (c.id === id ? { ...c, version } : c);
					queryClient.setQueryData<DatabaseConnection>(DATABASE_KEYS.one(id), prev => (prev ? withVersion(prev) : prev));
					queryClient.setQueryData<DatabaseConnection[]>(DATABASE_KEYS.list, prev => prev?.map(withVersion));
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) setState({ status: 'error', sessionId: null, error: (err as { message?: string })?.message ?? 'No se pudo conectar' });
			});

		const closeOnExit = () => { if (opened) databasesApi.closeSession(id, opened); };
		window.addEventListener('pagehide', closeOnExit);
		return () => {
			cancelled = true;
			window.removeEventListener('pagehide', closeOnExit);
			closeOnExit();
		};
	}, [id, manageable, attempt, queryClient]);

	/* Estables: la vista los usa en efectos y no deben dispararlos en cada render. */
	const reconnect = useCallback(() => setAttempt(a => a + 1), []);
	const markClosed = useCallback(
		() => setState({ status: 'closed', sessionId: null, error: 'La conexión de esta vista se cerró.' }),
		[],
	);

	return { ...state, reconnect, markClosed };
}

/** Bases de la conexión, por la sesión abierta. */
export function useDatabaseSchemas(conn: DatabaseConnection | undefined, sessionId: string | null) {
	const { isAuthenticated } = useAuth();
	return useQuery({
		queryKey: DATABASE_KEYS.schemas(conn?.id ?? '', sessionId ?? ''),
		queryFn: () => databasesApi.schemas(conn!.id, sessionId!),
		enabled: isAuthenticated && Boolean(conn) && Boolean(sessionId),
		retry: false,
		staleTime: 1000 * 60,
	});
}

/** Una sección de una base (tablas, vistas…): se pide al desplegarla en el árbol. */
export function useSchemaSection<S extends SchemaSection>(
	id: string, sessionId: string, schema: string, section: S, enabled: boolean,
) {
	const { isAuthenticated } = useAuth();
	return useQuery({
		queryKey: DATABASE_KEYS.section(id, sessionId, schema, section),
		queryFn: () => databasesApi.section(id, schema, section, sessionId),
		enabled: isAuthenticated && enabled && Boolean(sessionId),
		retry: false,
		staleTime: 1000 * 60,
	});
}

export function useRunQuery(id: string, sessionId: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ sql, schema, confirm }: { sql: string; schema: string | null; confirm?: boolean }) => {
			if (!sessionId) return Promise.reject(new Error('La vista todavía no está conectada'));
			return databasesApi.query(id, sessionId, sql, schema, confirm);
		},
		/* Una confirmada deja fila en la auditoría, salga bien o mal. */
		onSettled: (_data, _err, vars) => {
			if (vars.confirm) void queryClient.invalidateQueries({ queryKey: DATABASE_KEYS.audit(id) });
		},
	});
}

/** Consultas peligrosas confirmadas sobre la conexión. */
export function useQueryAudit(id: string, enabled: boolean) {
	const { isAuthenticated } = useAuth();
	return useQuery({
		queryKey: DATABASE_KEYS.audit(id),
		queryFn: () => databasesApi.audit(id),
		enabled: isAuthenticated && enabled,
		retry: false,
	});
}

/* Crear y editar devuelven la conexión guardada: se escribe directamente en
   la caché para que la tarjeta cambie sin esperar a la lista. */
function useConnectionMutation<TArgs>(fn: (args: TArgs) => Promise<DatabaseConnection>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: (conn) => {
			queryClient.setQueryData<DatabaseConnection[]>(DATABASE_KEYS.list, (prev = []) =>
				prev.some(c => c.id === conn.id)
					? prev.map(c => (c.id === conn.id ? conn : c))
					: [conn, ...prev]);
			queryClient.setQueryData(DATABASE_KEYS.one(conn.id), conn);
		},
	});
}

export const useCreateDatabaseConnection = () =>
	useConnectionMutation((form: DatabaseConnectionForm) => databasesApi.create(form));

export const useUpdateDatabaseConnection = () =>
	useConnectionMutation(({ id, form }: { id: string; form: DatabaseConnectionForm }) =>
		databasesApi.update(id, form));

export function useDeleteDatabaseConnection() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => databasesApi.remove(id),
		onSuccess: (_, id) => {
			queryClient.setQueryData<DatabaseConnection[]>(DATABASE_KEYS.list, (prev = []) =>
				prev.filter(c => c.id !== id));
			removeEditors(id);
			removeQueries(id);
		},
	});
}

export const useTestDatabaseConnection = () =>
	useMutation({
		mutationFn: (args: Parameters<typeof databasesApi.test>[0]) => databasesApi.test(args),
	});
