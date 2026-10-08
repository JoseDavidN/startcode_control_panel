import { checkCommandPolicy } from './command-policy';

describe('checkCommandPolicy', () => {
  it.each([
    ['cd /etc', 'cd'],
    ['ls && cd /var', 'cd'],
    ['pushd /tmp', 'pushd'],
    ['pwd', 'pwd'],
    ['echo $PWD', '$PWD'],
    ['echo ${OLDPWD}', '$PWD'],
    ['df -h', 'df'],
    ['du -sh /var/log', 'du'],
    ['sudo lsblk', 'lsblk'],
    ['/usr/bin/df', 'df'],
    ['LANG=C fdisk -l', 'fdisk'],
    ['timeout 5 findmnt', 'findmnt'],
    ['ls | xargs du', 'du'],
    ['echo $(pwd)', 'pwd'],
    ['echo `df`', 'df'],
    ['(cd /; ls)', 'cd'],
    ['mount', 'mount'],
    ['bash', 'bash'],
    ['sudo su -', 'su'],
  ])('rechaza %s', (command, program) => {
    expect(checkCommandPolicy(command)).toMatchObject({ program });
  });

  it.each([
    'ls -la /var/www',
    'systemctl status nginx',
    'docker ps',
    'tail -n 50 /var/log/syslog',
    'grep -r df /etc/fstab',
    'cat /var/www/cdn.conf',
    'echo $HOME',
    'apt list --upgradable',
  ])('permite %s', command => {
    expect(checkCommandPolicy(command)).toBeNull();
  });
});
