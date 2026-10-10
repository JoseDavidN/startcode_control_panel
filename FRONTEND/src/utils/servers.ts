/* Valores fijos de los servidores, compartidos por los modales y la lista. */

export const SERVER_OS_OPTIONS = [
  { value: 'ubuntu',  label: 'Ubuntu' },
  { value: 'centos',  label: 'CentOS' },
  { value: 'debian',  label: 'Debian' },
  { value: 'fedora',  label: 'Fedora' },
  { value: 'arch',    label: 'Arch Linux' },
  { value: 'solaris', label: 'Solaris' },
  { value: 'openbsd', label: 'OpenBSD' },
  { value: 'netbsd',  label: 'NetBSD' },
  { value: 'freebsd', label: 'FreeBSD' },
  { value: 'other',   label: 'Otro' },
];

export const osLabel = (os: string): string => SERVER_OS_OPTIONS.find(o => o.value === os)?.label ?? os;
