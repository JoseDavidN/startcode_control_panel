// src/utils/metrics.ts

/**
 * Escala de color por saturación, compartida por el detalle de servidor y el
 * dashboard: mismo umbral, mismo color, en toda la app.
 */
export const barGradient = (pct: number): string => {
	if (pct >= 90) return 'from-rose-500 to-orange-500';
	if (pct >= 70) return 'from-amber-400 to-orange-500';
	if (pct >= 50) return 'from-sky-500 to-cyan-400';
	return 'from-emerald-500 to-teal-400';
};

/** systemd y el agente reportan tamaños en bytes; esto es lo que se pinta. */
export const formatBytes = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
};

/** Partición montada tal como la normaliza `useServerDetail` (tamaños en GB). */
export interface PartitionUsage {
	device: string;
	mountPoint: string;
	total: number;
	used: number;
	usagePercent: number;
}

/** Un disco físico con el total de sus particiones montadas. */
export interface DiskGroup {
	disk: string;
	total: number;
	used: number;
	usagePercent: number;
	partitions: PartitionUsage[];
}

/**
 * Disco al que pertenece una partición, por el nombre del dispositivo:
 * `/dev/sda1` → `sda`, `/dev/nvme0n1p2` → `nvme0n1`, `/dev/mmcblk0p1` →
 * `mmcblk0`. Lo que no sigue ese patrón (LVM, `/dev/mapper/…`, `overlay`)
 * no revela su disco físico y queda como grupo propio.
 */
export const diskOf = (device: string): string => {
	const name = device.replace(/^\/dev\//, '');
	if (name.includes('/')) return name.slice(name.lastIndexOf('/') + 1);
	const nvme = /^((?:nvme\d+n\d+)|(?:mmcblk\d+)|(?:loop\d+))p\d+$/.exec(name);
	if (nvme) return nvme[1];
	const classic = /^((?:sd|vd|xvd|hd)[a-z]+)\d+$/.exec(name);
	return classic ? classic[1] : name;
};

/**
 * Agrupa las particiones por disco. El total del disco es la suma de sus
 * particiones montadas (el agente no reporta el tamaño físico ni lo que no
 * está montado). Un mismo dispositivo montado varias veces (bind mounts) se
 * cuenta una sola vez, con el punto de montaje más corto.
 */
export const groupDisks = (partitions: PartitionUsage[]): DiskGroup[] => {
	const byDevice = new Map<string, PartitionUsage>();
	for (const p of partitions) {
		const key = p.device || p.mountPoint;
		const prev = byDevice.get(key);
		if (!prev || p.mountPoint.length < prev.mountPoint.length) byDevice.set(key, p);
	}

	const groups = new Map<string, DiskGroup>();
	for (const p of byDevice.values()) {
		const disk = p.device ? diskOf(p.device) : p.mountPoint;
		const group = groups.get(disk) ?? { disk, total: 0, used: 0, usagePercent: 0, partitions: [] };
		group.total += p.total;
		group.used += p.used;
		group.partitions.push(p);
		groups.set(disk, group);
	}

	return [...groups.values()].map(g => ({
		...g,
		usagePercent: g.total > 0 ? (g.used / g.total) * 100 : 0,
		partitions: g.partitions.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint)),
	}));
};
