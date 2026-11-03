import React, { useEffect, useRef, useState } from 'react';
import type { SftpEntry, SftpListing } from '@typings/sftp.types';
import { ArrowUpIcon, FolderIcon, FolderPlusIcon, RefreshIcon } from './icons';

interface SftpPathBarProps {
	cwd: string;
	busy: boolean;
	onNavigate: (path: string) => void;
	onUp: () => void;
	onRefresh: () => void;
	onNewFolder: () => void;
	/** Lista una carpeta sin entrar en ella, para las sugerencias. */
	peek: (path: string) => Promise<SftpListing>;
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
		className="mo-tab w-10 h-10 shrink-0 rounded-xl glass-soft text-white/70 hover:text-white
			row-hit flex items-center justify-center transition disabled:opacity-40"
	>
		{children}
	</button>
);

const isDir = (entry: SftpEntry) => entry.type === 'dir' || entry.linkType === 'dir';

/** «/var/ww» → carpeta «/var» y lo escrito «ww». */
const splitDraft = (draft: string) => {
	const slash = draft.lastIndexOf('/');
	return {
		parent: slash <= 0 ? '/' : draft.slice(0, slash),
		prefix: draft.slice(slash + 1),
	};
};

/**
 * Ruta editable con sugerencias: al escribir, se listan las carpetas que hay
 * en ese punto de la ruta. Elegir una la añade y muestra las suyas, así la
 * ruta se construye carpeta a carpeta sin salir del campo.
 */
export const SftpPathBar: React.FC<SftpPathBarProps> = ({
	cwd,
	busy,
	onNavigate,
	onUp,
	onRefresh,
	onNewFolder,
	peek,
}) => {
	const [draft, setDraft] = useState(cwd);
	const [open, setOpen] = useState(false);
	const [suggestions, setSuggestions] = useState<SftpEntry[]>([]);
	const [active, setActive] = useState(-1);
	const cache = useRef(new Map<string, SftpEntry[]>());
	const listRef = useRef<HTMLDivElement>(null);

	// La ruta cambia también al navegar desde la lista: el campo la sigue.
	useEffect(() => {
		setDraft(cwd);
		setOpen(false);
	}, [cwd]);

	/* Lo que hay en disco cambia al subir o crear carpetas: la caché vale
	   solo mientras no se recarga. */
	useEffect(() => cache.current.clear(), [busy]);

	useEffect(() => {
		if (!open) return;
		const { parent, prefix } = splitDraft(draft);
		let alive = true;

		const timer = setTimeout(() => {
			const cached = cache.current.get(parent);
			const load = cached
				? Promise.resolve(cached)
				: peek(parent).then(result => {
						const dirs = result.entries.filter(isDir);
						cache.current.set(parent, dirs);
						return dirs;
					});

			load
				.then(dirs => {
					if (!alive) return;
					const needle = prefix.toLowerCase();
					setSuggestions(
						dirs
							.filter(d => (needle.startsWith('.') || !d.name.startsWith('.')))
							.filter(d => d.name.toLowerCase().startsWith(needle))
							.slice(0, 200),
					);
					setActive(-1);
				})
				.catch(() => alive && setSuggestions([]));
		}, 120);

		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [draft, open, peek]);

	// La opción resaltada con el teclado siempre a la vista.
	useEffect(() => {
		if (active < 0) return;
		listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
	}, [active]);

	const complete = (entry: SftpEntry) => {
		const { parent } = splitDraft(draft);
		setDraft(`${parent === '/' ? '' : parent}/${entry.name}/`);
		setOpen(true);
	};

	const go = (path: string) => {
		setOpen(false);
		const clean = path.trim().replace(/(.)\/+$/, '$1');
		if (clean) onNavigate(clean);
	};

	const crumbs = cwd.split('/').filter(Boolean);
	const showList = open && suggestions.length > 0;

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<div className="relative flex-1 min-w-0">
					<div className="glass-input rounded-xl h-10 flex items-center px-3.5 transition">
						<input
							value={draft}
							onChange={e => {
								setDraft(e.target.value);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							onBlur={() => setOpen(false)}
							onKeyDown={e => {
								if (e.key === 'ArrowDown' && suggestions.length > 0) {
									e.preventDefault();
									setOpen(true);
									setActive(i => Math.min(suggestions.length - 1, i + 1));
								} else if (e.key === 'ArrowUp' && suggestions.length > 0) {
									e.preventDefault();
									setActive(i => Math.max(0, i - 1));
								} else if (e.key === 'Tab' && showList) {
									e.preventDefault();
									complete(suggestions[Math.max(0, active)]);
								} else if (e.key === 'Enter') {
									if (showList && active >= 0) complete(suggestions[active]);
									else go(draft);
								} else if (e.key === 'Escape' && open) {
									/* Solo cierra las sugerencias, no el modal. */
									e.stopPropagation();
									e.nativeEvent.stopImmediatePropagation();
									setOpen(false);
									setDraft(cwd);
								}
							}}
							spellCheck={false}
							placeholder="/ruta/en/el/servidor"
							className="w-full bg-transparent outline-none text-sm font-mono text-white/90
								placeholder:text-white/30"
						/>
					</div>

					{showList && (
						<div
							ref={listRef}
							role="listbox"
							/* mousedown: el clic llega antes del blur del campo. */
							onMouseDown={e => e.preventDefault()}
							className="absolute left-0 right-0 top-full mt-1.5 z-[70] max-h-72 overflow-y-auto scroll-thin
								glass-float elev-float border border-hairline rounded-xl p-1"
						>
							{suggestions.map((entry, index) => (
								<button
									key={entry.path}
									type="button"
									role="option"
									aria-selected={index === active}
									onClick={() => complete(entry)}
									onDoubleClick={() => go(entry.path)}
									onMouseEnter={() => setActive(index)}
									className={`w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-left text-sm font-mono transition ${
										index === active ? 'bg-tint-hover text-white' : 'text-white/75'
									}`}
								>
									<FolderIcon className="w-4 h-4 shrink-0 text-violet-300" />
									<span className="truncate">{entry.name}</span>
								</button>
							))}
						</div>
					)}
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

			<div className="flex items-center gap-1 min-w-0 overflow-hidden text-xs font-mono">
				<button
					type="button"
					onClick={() => onNavigate('/')}
					className="px-1.5 py-0.5 rounded-md text-white/45 hover:text-white hover:bg-tint-hover transition shrink-0"
				>
					/
				</button>
				{crumbs.map((crumb, index) => (
					<React.Fragment key={`${crumb}-${index}`}>
						<span className="text-white/25 shrink-0">/</span>
						<button
							type="button"
							onClick={() => onNavigate(`/${crumbs.slice(0, index + 1).join('/')}`)}
							className={`px-1.5 py-0.5 rounded-md transition hover:bg-tint-hover truncate ${
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
