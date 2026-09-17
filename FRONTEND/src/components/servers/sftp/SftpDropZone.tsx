import React, { useRef, useState } from 'react';
import { getFilePicker, type PickedFile } from '@lib/filePicker';
import { UploadIcon } from './icons';

interface SftpDropZoneProps {
	destDir: string;
	disabled: boolean;
	onFiles: (files: PickedFile[]) => void;
}

export const SftpDropZone: React.FC<SftpDropZoneProps> = ({ destDir, disabled, onFiles }) => {
	const [dragging, setDragging] = useState(false);
	const [picking, setPicking] = useState(false);
	/* Los hijos disparan dragenter/dragleave al pasar por encima: sin contador
	   el resaltado parpadea. */
	const depth = useRef(0);

	const pick = async (kind: 'files' | 'directory') => {
		setPicking(true);
		try {
			const picker = await getFilePicker();
			const files =
				kind === 'files' ? await picker.pickFiles() : await picker.pickDirectory();
			if (files.length > 0) onFiles(files);
		} finally {
			setPicking(false);
		}
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		depth.current = 0;
		setDragging(false);
		if (disabled) return;

		void (async () => {
			const picker = await getFilePicker();
			const files = await picker.fromDropEvent(event);
			if (files.length > 0) onFiles(files);
		})();
	};

	return (
		<div
			onDragEnter={e => {
				e.preventDefault();
				depth.current += 1;
				if (!disabled) setDragging(true);
			}}
			onDragOver={e => e.preventDefault()}
			onDragLeave={e => {
				e.preventDefault();
				depth.current -= 1;
				if (depth.current <= 0) setDragging(false);
			}}
			onDrop={handleDrop}
			className={`rounded-xl border border-dashed p-5 text-center transition ${
				dragging ? 'grad-brand-soft border-violet-400/40' : 'border-white/[0.12]'
			} ${disabled ? 'opacity-50' : ''}`}
		>
			<UploadIcon className="w-6 h-6 mx-auto text-white/35 mb-2" />
			<p className="text-sm text-white/70">Suelta aquí archivos o carpetas</p>
			<p className="text-xs text-white/40 mt-1">
				Destino: <span className="font-mono text-white/60">{destDir || '—'}</span>
			</p>

			<div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
				<button
					type="button"
					disabled={disabled || picking}
					onClick={() => void pick('files')}
					className="glass-soft text-white/85 text-sm font-medium px-4 h-10 rounded-xl
						hover:bg-white/[0.07] transition disabled:opacity-50"
				>
					Elegir archivos
				</button>
				<button
					type="button"
					disabled={disabled || picking}
					onClick={() => void pick('directory')}
					className="glass-soft text-white/85 text-sm font-medium px-4 h-10 rounded-xl
						hover:bg-white/[0.07] transition disabled:opacity-50"
				>
					Elegir carpeta
				</button>
			</div>
		</div>
	);
};
