import { AssistantMemoryService, toAlternating } from './assistant-memory.service';

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

describe('AssistantMemoryService.summarizeAndClear (/resume)', () => {
  const access = { provider: 'anthropic' as never, model: 'm', apiKey: 'k' };
  const msg = (id: string, role: string, content: string) => ({ id, role, content }) as never;

  function setup(pending: unknown[], opts: { total?: number; reply?: string; summary?: string } = {}) {
    const messages = {
      find: jest.fn().mockResolvedValue(pending),
      count: jest.fn().mockResolvedValue(opts.total ?? pending.length),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const saved: { summary?: string } = {};
    const memory = {
      findOne: jest.fn().mockResolvedValue(opts.summary !== undefined ? { userId: 'u', summary: opts.summary, summarizedCount: 0 } : null),
      create: jest.fn((v: object) => ({ ...v })),
      save: jest.fn((m: { summary: string }) => { saved.summary = m.summary; return Promise.resolve(m); }),
    };
    const providers = { complete: jest.fn().mockResolvedValue({ text: opts.reply ?? '- resumen' }) };
    const service = new AssistantMemoryService(messages as never, memory as never, providers as never);
    return { service, messages, memory, providers, saved };
  }

  it('resume todo lo pendiente, guarda el resumen y vacía la conversación', async () => {
    const { service, messages, providers, saved } = setup([msg('1', 'user', 'hola'), msg('2', 'assistant', 'qué tal')]);
    const res = await service.summarizeAndClear('u', access);
    expect(providers.complete).toHaveBeenCalledTimes(1);
    expect(saved.summary).toBe('- resumen');
    expect(res).toEqual({ summary: '- resumen', summarized: 2 });
    expect(messages.delete).toHaveBeenCalledWith({ userId: 'u' });
  });

  it('con un resumen vacío no borra nada', async () => {
    const { service, messages } = setup([msg('1', 'user', 'hola')], { reply: '  ' });
    await expect(service.summarizeAndClear('u', access)).rejects.toThrow('resumen vacío');
    expect(messages.delete).not.toHaveBeenCalled();
  });

  it('sin mensajes falla; con todo ya resumido solo vacía el chat', async () => {
    await expect(setup([], { total: 0 }).service.summarizeAndClear('u', access)).rejects.toThrow('No hay mensajes');

    const { service, messages, providers } = setup([], { total: 5, summary: '- previo' });
    await expect(service.summarizeAndClear('u', access)).resolves.toEqual({ summary: '- previo', summarized: 0 });
    expect(providers.complete).not.toHaveBeenCalled();
    expect(messages.delete).toHaveBeenCalledWith({ userId: 'u' });
  });
});
