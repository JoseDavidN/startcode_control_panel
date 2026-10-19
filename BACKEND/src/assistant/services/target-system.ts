/*
 * Sistema de destino de lo que el asistente va a proponer: con qué gestor de
 * paquetes y qué arranque se instalan y manejan servicios en un servidor,
 * deducido del nombre de la distribución que reporta el agente o el usuario.
 * Puro, sin base de datos, para poder probarlo.
 */

export interface SystemTraits {
  /** apt, dnf, yum, zypper, apk, pacman o pkg; null si no se reconoce. */
  packages: string | null;
  /** systemd, openrc o rc (BSD); null si no se reconoce. */
  init: string | null;
}

/* El orden importa: Rocky, Alma y CentOS también se llaman «Red Hat» o «fedora» en ID_LIKE. */
const RULES: { test: RegExp; packages: string; init: string }[] = [
  { test: /alpine/, packages: 'apk', init: 'openrc' },
  { test: /ubuntu|debian|mint|pop!?_?os|kali|raspbian|elementary|zorin|deepin|devuan/, packages: 'apt', init: 'systemd' },
  { test: /arch|manjaro|endeavour|garuda/, packages: 'pacman', init: 'systemd' },
  { test: /suse|sles/, packages: 'zypper', init: 'systemd' },
  /* Las versiones 7 de la familia Red Hat y Amazon Linux 2 aún usan yum. */
  { test: /(centos|rhel|red hat|oracle)[^\d]*7(\.|\b)|amazon linux 2(?!0)/, packages: 'yum', init: 'systemd' },
  { test: /fedora|rocky|alma|centos|rhel|red hat|oracle|amazon|cloudlinux|eurolinux/, packages: 'dnf', init: 'systemd' },
  { test: /freebsd|openbsd|netbsd/, packages: 'pkg', init: 'rc' },
];

export function systemTraits(...names: (string | null | undefined)[]): SystemTraits {
  const text = names.filter(Boolean).join(' ').toLowerCase();
  const rule = RULES.find(r => r.test.test(text));
  return rule ? { packages: rule.packages, init: rule.init } : { packages: null, init: null };
}

/** El nombre al final de un título de contexto: «Terminal · web-01» → «web-01». */
export function titleTarget(title: string): string | null {
  const i = title.lastIndexOf(' · ');
  const name = i >= 0 ? title.slice(i + 3).trim() : '';
  return name || null;
}
