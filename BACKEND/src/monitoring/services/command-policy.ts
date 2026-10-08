/**
 * Política de la línea de comandos del panel: es para comandos puntuales, no
 * una terminal. Cada comando corre en el home del usuario SSH y no puede
 * moverse de ahí, mostrar la ruta actual ni inspeccionar discos; para eso
 * está la terminal SSH.
 *
 * Es una política, no un sandbox: se revisa el primer programa de cada tramo
 * del comando (separado por `;`, `&&`, `||`, `|`, `&`, saltos de línea,
 * `$( )`, comillas invertidas y paréntesis), saltando asignaciones de
 * variables y envoltorios como `sudo`, `env` o `timeout`. Lo que de verdad
 * impide moverse es que el servidor ya no arrastra el directorio entre
 * comandos (`CommandService`).
 */

interface Rule {
  programs: string[];
  reason: string;
}

const RULES: Rule[] = [
  {
    programs: ['cd', 'pushd', 'popd'],
    reason: 'cambia de directorio; los comandos se ejecutan siempre en el home del usuario',
  },
  {
    programs: ['pwd', 'dirs'],
    reason: 'muestra la ruta actual',
  },
  {
    programs: [
      'df', 'du', 'ncdu', 'duf', 'dust', 'lsblk', 'blkid', 'findmnt', 'mount',
      'fdisk', 'sfdisk', 'cfdisk', 'gdisk', 'sgdisk', 'parted', 'partprobe',
      'smartctl', 'hdparm', 'iostat', 'udisksctl',
      'pvs', 'vgs', 'lvs', 'pvdisplay', 'vgdisplay', 'lvdisplay', 'pvscan', 'vgscan', 'lvscan',
      'zpool', 'zfs', 'btrfs', 'dumpe2fs', 'tune2fs', 'xfs_info',
    ],
    reason: 'muestra información de los discos; está en Recursos detallados',
  },
  {
    programs: ['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'su', 'screen', 'tmux'],
    reason: 'abre un shell; para eso está la terminal SSH',
  },
];

/** Programas que solo envuelven a otro: se mira el que va detrás. */
const WRAPPERS = new Set([
  'sudo', 'env', 'command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'ionice',
  'timeout', 'stdbuf', 'xargs', 'watch', 'eval', 'chroot', 'setsid', 'unbuffer',
]);

/** Variables que valen la ruta actual. */
const PWD_VARIABLE = /\$\{?(PWD|OLDPWD)\b/;

export interface PolicyViolation {
  program: string;
  reason: string;
}

const BY_PROGRAM = new Map(RULES.flatMap(r => r.programs.map(p => [p, r.reason] as const)));

/** Primer programa de un tramo, saltando asignaciones, envoltorios y sus opciones. */
function programOf(segment: string): string | null {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  let afterWrapper = false;

  while (i < words.length) {
    const word = words[i].replace(/^['"]|['"]$/g, '');
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) { i++; continue; }
    /* Opciones del envoltorio (`sudo -u x`, `timeout 5`, `nice -n 10`). */
    if (afterWrapper && (word.startsWith('-') || /^\d+[smhd]?$/.test(word))) { i++; continue; }

    const name = word.slice(word.lastIndexOf('/') + 1);
    if (WRAPPERS.has(name)) { afterWrapper = true; i++; continue; }
    return name || null;
  }
  return null;
}

/** `null` si el comando se puede ejecutar; si no, el programa y el motivo. */
export function checkCommandPolicy(command: string): PolicyViolation | null {
  if (PWD_VARIABLE.test(command)) {
    return { program: '$PWD', reason: 'muestra la ruta actual' };
  }

  const segments = command.split(/;|&&|\|\||\||&|\n|\$\(|`|\(|\)|\{|\}/);
  for (const segment of segments) {
    const program = programOf(segment);
    const reason = program ? BY_PROGRAM.get(program) : undefined;
    if (program && reason) return { program, reason };
  }
  return null;
}
