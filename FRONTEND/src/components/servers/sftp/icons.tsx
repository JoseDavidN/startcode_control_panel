/* SVG inline, sin librerías de iconos (regla 10 de DESIGN.md). */
const sp = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.75,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
};

export const SftpIcon = ({ className = 'w-5 h-5' }) => (
	<svg {...sp} className={className}>
		<path d="M12 3v10M8 9l4 4 4-4" />
		<path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
	</svg>
);

export const FolderIcon = ({ className = 'w-5 h-5' }) => (
	<svg {...sp} className={className}>
		<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
	</svg>
);

export const FileIcon = ({ className = 'w-5 h-5' }) => (
	<svg {...sp} className={className}>
		<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
		<polyline points="14 2 14 8 20 8" />
	</svg>
);

export const LinkIcon = ({ className = 'w-5 h-5' }) => (
	<svg {...sp} className={className}>
		<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
		<path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
	</svg>
);

export const ArrowUpIcon = ({ className = 'w-4 h-4' }) => (
	<svg {...sp} className={className}>
		<path d="M12 19V5M5 12l7-7 7 7" />
	</svg>
);

export const RefreshIcon = ({ className = 'w-4 h-4' }) => (
	<svg {...sp} className={className}>
		<path d="M21 12a9 9 0 11-3-6.7L21 8" />
		<path d="M21 3v5h-5" />
	</svg>
);

export const FolderPlusIcon = ({ className = 'w-4 h-4' }) => (
	<svg {...sp} className={className}>
		<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
		<path d="M12 11v6M9 14h6" />
	</svg>
);

export const UploadIcon = ({ className = 'w-5 h-5' }) => (
	<svg {...sp} className={className}>
		<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
		<polyline points="17 8 12 3 7 8" />
		<line x1="12" y1="3" x2="12" y2="15" />
	</svg>
);

export const XIcon = ({ className = 'w-4 h-4' }) => (
	<svg {...sp} className={className}>
		<path d="M18 6L6 18M6 6l12 12" />
	</svg>
);

export const CheckIcon = ({ className = 'w-4 h-4' }) => (
	<svg {...sp} className={className} strokeWidth={2}>
		<path d="M20 6L9 17l-5-5" />
	</svg>
);
