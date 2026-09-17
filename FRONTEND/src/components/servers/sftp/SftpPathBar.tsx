import React, { useEffect, useState } from 'react';
import { ArrowUpIcon, FolderPlusIcon, RefreshIcon } from './icons';

interface SftpPathBarProps {
	cwd: string;
	busy: boolean;
	onNavigate: (path: string) => void;
	onUp: () => void;
	onRefresh: () => void;
	onNewFolder: () => void;
}

/** Botón cuadrado del sistema de diseño, en la variante compacta del header. */
const IconButton = ({
	title,
	onClick,
	disabled,
	children,
}: {
	title: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) => (
	<button
		type="button"
		title={title}
		onClick={onClick}
		disabled={disabled}
		className="mo-tab w-9 h-9 shrink-0 rounded-xl glass-soft text-white/70 hover:text-white
			hover:bg-white/[0.07] flex items-center justify-center transition disabled:opacity-40"
	>
		{children}
	</button>
);

export const SftpPathBar: React.FC<SftpPathBarProps> = ({
	cwd,
	busy,
	onNavigate,
	onUp,
	onRefresh,
	onNewFolder,
}) => {
	const [draft, setDraft] = useState(cwd);

	// La ruta cambia también al navegar con doble clic: el input la sigue.
	useEffect(() => setDraft(cwd), [cwd]);

	const crumbs = cwd.split('/').filter(Boolean);

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<div className="glass-input rounded-xl h-11 flex items-center px-3.5 flex-1 min-w-0 transition">
					<input
						value={draft}
						onChange={e => setDraft(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter') onNavigate(draft.trim());
							if (e.key === 'Escape') setDraft(cwd);
						}}
						spellCheck={false}
						placeholder="/ruta/en/el/servidor"
						className="w-full bg-transparent outline-none text-sm font-mono text-white/90
							placeholder:text-white/30"
					/>
				</div>
				<IconButton title="Subir un nivel" onClick={onUp} disabled={cwd === '/' || busy}>
					<ArrowUpIcon />
				</IconButton>
				<IconButton title="Recargar" onClick={onRefresh} disabled={busy}>
					<RefreshIcon />
				</IconButton>
				<IconButton title="Nueva carpeta" onClick={onNewFolder} disabled={busy}>
					<FolderPlusIcon />
				</IconButton>
			</div>

			<div className="flex items-center gap-1 flex-wrap text-xs font-mono">
				<button
					type="button"
					onClick={() => onNavigate('/')}
					className="px-1.5 py-0.5 rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition"
				>
					/
				</button>
				{crumbs.map((crumb, index) => (
					<React.Fragment key={`${crumb}-${index}`}>
						<span className="text-white/25">/</span>
						<button
							type="button"
							onClick={() => onNavigate(`/${crumbs.slice(0, index + 1).join('/')}`)}
							className={`px-1.5 py-0.5 rounded-md transition hover:bg-white/[0.06] ${
								index === crumbs.length - 1
									? 'text-white'
									: 'text-white/45 hover:text-white'
							}`}
						>
							{crumb}
						</button>
					</React.Fragment>
				))}
			</div>
		</div>
	);
};
