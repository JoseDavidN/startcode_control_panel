import React, { useEffect, useState } from 'react';
import { Modal } from '@components/common/Modal';
import { useSftpSession } from '@hooks/useSftpSession';
import { useSftpUploads } from '@hooks/useSftpUploads';
import { notify } from '@services/notification.service';
import type { PickedFile } from '@lib/filePicker';
import type { SftpEntry } from '@typings/sftp.types';
import { SftpPathBar } from './SftpPathBar';
import { SftpFileList } from './SftpFileList';
import { SftpPreview } from './SftpPreview';
import { SftpDropZone } from './SftpDropZone';
import { SftpUploadQueue } from './SftpUploadQueue';

interface SftpModalProps {
	serverId: string;
	serverName: string;
	isOpen: boolean;
	onClose: () => void;
	/** Archivos para enviar a la carpeta que se elija (Compartir por SFTP desde Cloud). */
	incoming?: { label: string; summary: string; files: PickedFile[] };
}

const statusDot: Record<string, string> = {
	ready: 'bg-emerald-400',
	connecting: 'bg-amber-400 animate-pulse',
	reconnecting: 'bg-amber-400 animate-pulse',
	error: 'bg-rose-400',
	closed: 'bg-white/30',
	idle: 'bg-white/30',
};

const statusText: Record<string, string> = {
	ready: 'Conexión SFTP activa',
	connecting: 'Abriendo conexión SFTP…',
	reconnecting: 'Conexión interrumpida, reconectando…',
	error: 'No se pudo conectar',
	closed: 'Conexión cerrada',
	idle: '',
};

/**
 * Explorador SFTP. Alto fijo (todo el disponible) y tres columnas en una
 * sola vista: la carpeta actual, la vista previa de lo elegido y las
 * subidas. Cada columna desplaza dentro; el modal no cambia de tamaño.
 */
export const SftpModal: React.FC<SftpModalProps> = ({
	serverId,
	serverName,
	isOpen,
	onClose,
	incoming,
}) => {
	const session = useSftpSession(serverId, isOpen);
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [folderError, setFolderError] = useState<string | null>(null);
	const [selected, setSelected] = useState<SftpEntry | null>(null);
	/* Carpeta a la que ya se mandó lo de Cloud: no se envía dos veces sin querer. */
	const [sentTo, setSentTo] = useState<string | null>(null);

	const uploads = useSftpUploads({
		sessionId: session.sessionId,
		destDir: session.cwd,
		mkdirp: session.mkdirp,
		discard: session.discard,
		onLanded: session.refresh,
	});

	/* Al cambiar de carpeta la selección ya no está en la lista, salvo que la
	   haya puesto la vista previa al bajar un nivel. */
	useEffect(() => {
		setSelected(prev =>
			prev && (prev.path.slice(0, prev.path.lastIndexOf('/')) || '/') === session.cwd ? prev : null,
		);
	}, [session.cwd]);

	const connected = session.status === 'ready' || session.status === 'reconnecting';

	const handleFiles = (files: PickedFile[]) => {
		uploads.enqueue(files).catch((err: unknown) =>
			notify.error('No se pudo preparar la subida', err instanceof Error ? err.message : undefined),
		);
	};

	const handleCreateFolder = (name: string) => {
		setFolderError(null);
		session
			.createFolder(name)
			.then(() => setCreatingFolder(false))
			.catch((err: unknown) =>
				setFolderError(err instanceof Error ? err.message : 'No se pudo crear la carpeta'),
			);
	};

	const navigate = (path: string) => void session.navigate(path);

	/* Desde la vista previa: entrar en la carpeta elegida y dejar como nueva
	   selección la subcarpeta pulsada. */
	const drill = (parent: string, child: SftpEntry) => {
		void session.navigate(parent).then(() => setSelected(child));
	};

	const sendIncoming = () => {
		if (!incoming) return;
		setSentTo(session.cwd);
		handleFiles(incoming.files);
	};
	const sending = uploads.items.some(item => item.status === 'queued' || item.status === 'uploading');

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={incoming ? `Enviar por SFTP · ${serverName}` : `SFTP · ${serverName}`}
			size="2xl"
			tall
		>
			<div className="h-full min-h-0 flex flex-col gap-4">
				{/* Estado de la conexión */}
				<div className="flex items-center gap-2.5 shrink-0">
					<span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[session.status]}`} />
					<span className="text-sm text-white/75">{statusText[session.status]}</span>
					{session.info && (
						<span className="text-xs text-white/45 font-mono truncate">
							{session.info.user}@{session.info.host}
						</span>
					)}
				</div>

				{session.error && (
					<div className="glass-soft rounded-xl p-4 border border-rose-400/20 shrink-0">
						<p className="text-sm font-semibold text-rose-300 mb-1">Error de conexión SFTP</p>
						<p className="text-xs text-rose-200/80">{session.error}</p>
					</div>
				)}

				{connected && (
					<>
						<div className="shrink-0">
							<SftpPathBar
								cwd={session.cwd}
								busy={session.listing}
								onNavigate={navigate}
								onUp={session.up}
								onRefresh={session.refresh}
								peek={session.peek}
								onNewFolder={() => {
									setFolderError(null);
									setCreatingFolder(true);
								}}
							/>
							{folderError && <p className="text-xs text-rose-300 mt-2">{folderError}</p>}
						</div>

						{incoming && (
							<div className="glass-soft rounded-xl px-4 py-3 flex items-center gap-3 border border-hairline-strong shrink-0">
								<div className="flex-1 min-w-0">
									<p className="text-sm text-white/85 truncate">
										<span className="font-medium text-white">{incoming.label}</span>
										<span className="text-white/45"> · {incoming.summary}</span>
									</p>
									<p className="text-xs text-white/45 truncate">
										{sentTo
											? <>Enviado a <span className="font-mono">{sentTo}</span>{sending ? ': no cierres esta ventana hasta que termine.' : '.'}</>
											: <>Destino: <span className="font-mono text-white/70">{session.cwd}</span>. Navega hasta la carpeta y pulsa Enviar aquí.</>}
									</p>
								</div>
								<button type="button" onClick={sendIncoming} disabled={!session.sessionId || sentTo === session.cwd}
									className="mo-tab grad-brand elev-brand-sm hover:elev-brand text-sm font-semibold px-4 h-10 rounded-xl shrink-0 transition disabled:opacity-50"
									style={{ color: 'var(--on-brand)' }}>
									{sentTo === session.cwd ? 'Enviado' : 'Enviar aquí'}
								</button>
							</div>
						)}

						<div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_280px_340px] gap-4">
							<SftpFileList
								entries={session.entries}
								loading={session.listing}
								error={session.listError}
								creatingFolder={creatingFolder}
								selected={selected?.path ?? null}
								onSelect={setSelected}
								onNavigate={navigate}
								onCreateFolder={handleCreateFolder}
								onCancelCreateFolder={() => setCreatingFolder(false)}
							/>

							<SftpPreview
								entry={selected}
								peek={session.peek}
								onOpen={navigate}
								onDrill={drill}
							/>

							<div className="min-h-0 flex flex-col gap-3">
								<div className="shrink-0">
									<SftpDropZone
										destDir={session.cwd}
										disabled={!session.sessionId}
										onFiles={handleFiles}
									/>
								</div>
								<div className="flex-1 min-h-0">
									<SftpUploadQueue
										items={uploads.items}
										totals={uploads.totals}
										onCancel={uploads.cancel}
										onRetry={uploads.retry}
										onRetryAllConflicts={uploads.retryAllConflicts}
										onRetryAllFailed={uploads.retryAllFailed}
										onClearFinished={uploads.clearFinished}
									/>
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</Modal>
	);
};
