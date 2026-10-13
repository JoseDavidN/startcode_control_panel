import { aggregateStats, ACTIVITY_DAYS } from './stats';
import type { CloudEntryDto, CloudFolderDto } from './files.types';

const file = (id: string, size: number, modifiedAt: string): CloudEntryDto => ({
  kind: 'file', id, name: id.split('/').pop()!, type: id.endsWith('.mp4') ? 'video' : id.endsWith('.pdf') ? 'pdf' : 'text',
  size, createdAt: modifiedAt, modifiedAt,
});
const folder = (id: string, children: CloudEntryDto[]): CloudFolderDto => ({
  kind: 'folder', id, name: id || 'root', createdAt: '', modifiedAt: '', children,
});

const NOW = new Date('2026-10-11T15:00:00Z');

describe('aggregateStats', () => {
  const home = folder('', [
    file('a.pdf', 100, '2026-10-11T08:00:00Z'),
    folder('Videos', [file('Videos/b.mp4', 5000, '2026-10-01T00:00:00Z'), file('Videos/c.mp4', 3000, '2026-09-12T23:59:59Z')]),
  ]);
  const backups = folder('', [file('d.txt', 10, '2026-09-11T00:00:00Z'), file('e.pdf', 400, '2020-01-01T00:00:00Z')]);
  const stats = aggregateStats({ home, backups }, false, NOW);

  it('suma archivos y bytes por sección, también en subcarpetas', () => {
    expect(stats.sections).toEqual({ home: { files: 3, bytes: 8100 }, backups: { files: 2, bytes: 410 } });
  });

  it('agrupa por tipo de mayor a menor tamaño', () => {
    expect(stats.byType).toEqual([
      { type: 'video', files: 2, bytes: 8000 },
      { type: 'pdf', files: 2, bytes: 500 },
      { type: 'text', files: 1, bytes: 10 },
    ]);
  });

  it('actividad: 30 días hasta hoy, con los días vacíos a cero', () => {
    expect(stats.activity).toHaveLength(ACTIVITY_DAYS);
    expect(stats.activity[0].date).toBe('2026-09-12');
    expect(stats.activity.at(-1)).toEqual({ date: '2026-10-11', files: 1, bytes: 100 });
    expect(stats.activity[0]).toEqual({ date: '2026-09-12', files: 1, bytes: 3000 });
    /* 2026-09-11 queda fuera de la ventana. */
    expect(stats.activity.reduce((n, d) => n + d.files, 0)).toBe(3);
  });

  it('los más grandes, de mayor a menor', () => {
    expect(stats.largest.map(f => f.id)).toEqual(['Videos/b.mp4', 'Videos/c.mp4', 'e.pdf', 'a.pdf', 'd.txt']);
    expect(stats.largest[0].section).toBe('home');
  });
});
