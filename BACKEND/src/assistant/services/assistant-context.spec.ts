import { DatabaseEngine } from '@/databases/entities/database-connection.entity';
import { AssistantContextService } from './assistant-context.service';

/* Repositorios mínimos: solo `find`, que es lo que usa `destinations`. */
const repo = <T>(rows: T[]) => ({ find: jest.fn().mockResolvedValue(rows) });

function service() {
  const servers = repo([
    { id: 's1', name: 'web-01', host: '10.0.0.5', hostname: 'web01', os: 'other', osVersion: null, kernelVersion: null },
    { id: 's2', name: 'db-rocky', host: '10.0.0.6', hostname: null, os: 'centos', osVersion: 'Rocky Linux 9.3', kernelVersion: '5.14' },
  ]);
  const metrics = repo([{ server_id: 's1', system_distro: 'Ubuntu 22.04.4 LTS', system_kernel: '5.15.0', system_arch: 'x64' }]);
  const connections = repo([
    { id: 'c1', name: 'ventas', engine: DatabaseEngine.POSTGRESQL, version: '16.2', database: 'ventas' },
    { id: 'c2', name: 'cache', engine: DatabaseEngine.REDIS, version: null, database: '2' },
  ]);
  const none = repo([]);
  return new AssistantContextService(servers as never, metrics as never, none as never, connections as never, none as never, none as never);
}

describe('AssistantContextService.destinations', () => {
  it('da el sistema de la terminal abierta con su gestor de paquetes y arranque', async () => {
    const out = await service().destinations('u', [{ type: 'terminal', title: 'Terminal · web-01' }], '¿cómo instalo nginx?');
    expect(out).toBe('- Servidor «web-01»: Ubuntu 22.04.4 LTS, kernel 5.15.0, x64, paquetes: apt, servicios: systemd');
  });

  it('sin agente usa la versión guardada y pide confirmarla', async () => {
    const out = await service().destinations('u', [], 'reinicia apache en db-rocky');
    expect(out).toContain('Servidor «db-rocky»: Rocky Linux 9.3, kernel 5.14, paquetes: dnf, servicios: systemd');
    expect(out).toContain('cat /etc/os-release');
  });

  it('da el motor y la versión de la base abierta (por referencia o por título)', async () => {
    const svc = service();
    expect(await svc.destinations('u', [{ type: 'schema', title: 'Estructura · ventas', database: { connectionId: 'c1', schema: 'ventas' } }], 'top clientes'))
      .toBe('- Base «ventas»: PostgreSQL 16.2, base ventas');
    expect(await svc.destinations('u', [{ type: 'command_output', title: 'Consola Redis · cache' }], 'claves que caducan'))
      .toBe('- Base «cache»: Redis (versión sin confirmar), base db2');
  });

  it('nada en pantalla ni nombrado: vacío', async () => {
    expect(await service().destinations('u', [], '¿qué es un inodo?')).toBe('');
  });
});
