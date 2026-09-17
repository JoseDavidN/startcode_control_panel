import { useCallback, useEffect, useRef, useState } from 'react';
import { openSftpConnection, type SftpConnection } from '@services/sftp.service';
import type { SftpEntry, SftpStatus } from '@typings/sftp.types';

/**
 * Sesión SFTP viva mientras el modal está abierto.
 *
 * No usa React Query a propósito: esto no es caché compartida, es el estado de
 * una conexión efímera que muere con el componente.
 */
export function useSftpSession(serverId: string, enabled: boolean) {
	const [status, setStatus] = useState<SftpStatus>('idle');
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<{ user: string; host: string; home: string } | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const [cwd, setCwd] = useState('');
	const [entries, setEntries] = useState<SftpEntry[]>([]);
	const [listing, setListing] = useState(false);
	const [listError, setListError] = useState<string | null>(null);

	const connectionRef = useRef<SftpConnection | null>(null);

	useEffect(() => {
		if (!enabled) return;

		let alive = true;
		setStatus('connecting');
		setError(null);

		openSftpConnection(serverId)
			.then(connection => {
				if (!alive) {
					connection.close();
					return;
				}

				connectionRef.current = connection;
				connection.onClosed(() => {
					if (alive) setStatus('closed');
				});

				setSessionId(connection.sessionId);
				setInfo({ user: connection.user, host: connection.host, home: connection.home });
				setStatus('ready');

				return connection.list(connection.home).then(result => {
					if (!alive) return;
					setCwd(result.path);
					setEntries(result.entries);
				});
			})
			.catch((err: unknown) => {
				if (!alive) return;
				setStatus('error');
				setError(err instanceof Error ? err.message : 'No se pudo abrir la sesión SFTP');
			});

		return () => {
			alive = false;
			connectionRef.current?.close();
			connectionRef.current = null;
		};
	}, [serverId, enabled]);

	const navigate = useCallback(async (path: string) => {
		const connection = connectionRef.current;
		if (!connection) return;

		setListing(true);
		setListError(null);
		try {
			const result = await connection.list(path);
			setCwd(result.path);
			setEntries(result.entries);
		} catch (err: unknown) {
			setListError(err instanceof Error ? err.message : 'No se pudo leer el directorio');
		} finally {
			setListing(false);
		}
	}, []);

	const refresh = useCallback(() => {
		if (cwd) void navigate(cwd);
	}, [cwd, navigate]);

	const up = useCallback(() => {
		if (!cwd || cwd === '/') return;
		void navigate(cwd.slice(0, cwd.lastIndexOf('/')) || '/');
	}, [cwd, navigate]);

	const createFolder = useCallback(
		async (name: string) => {
			const connection = connectionRef.current;
			if (!connection || !cwd) return;

			await connection.mkdir(cwd, name);
			await navigate(cwd);
		},
		[cwd, navigate],
	);

	const mkdirp = useCallback(async (base: string, dirs: string[]) => {
		const connection = connectionRef.current;
		if (!connection || dirs.length === 0) return;
		await connection.mkdirp(base, dirs);
	}, []);

	return {
		status,
		error,
		info,
		sessionId,
		cwd,
		entries,
		listing,
		listError,
		navigate,
		refresh,
		up,
		createFolder,
		mkdirp,
	};
}
