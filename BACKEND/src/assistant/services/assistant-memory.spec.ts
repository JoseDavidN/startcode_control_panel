import { toAlternating } from './assistant-memory.service';

describe('toAlternating', () => {
  it('descarta las respuestas iniciales y el usuario final sin respuesta', () => {
    expect(
      toAlternating([
        { role: 'assistant', content: 'a0' },
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
      ]),
    ).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
    ]);
  });

  it('une turnos consecutivos del mismo rol', () => {
    expect(
      toAlternating([
        { role: 'user', content: 'u1' },
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a1' },
      ]),
    ).toEqual([
      { role: 'user', content: 'u1\n\nu2' },
      { role: 'assistant', content: 'a1' },
    ]);
  });

  it('historial vacío', () => {
    expect(toAlternating([])).toEqual([]);
  });
});
