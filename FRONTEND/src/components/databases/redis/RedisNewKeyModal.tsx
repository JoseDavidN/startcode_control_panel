import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';
import { Select } from '@components/common/Select';
import { messageOf } from '@components/databases/redis/redisStyles';
import { useRedisEdit } from '@hooks/useRedis';
import { notify } from '@services/notification.service';
import { parseStreamFields } from '@utils/redis';
import { REDIS_KEY_TYPES, REDIS_TYPE_LABELS, type RedisEditInput, type RedisKeyType } from '@typings/redis.types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  sessionId: string | null;
  db: number;
  onCreated: (key: string) => void;
}

const inputCls = 'w-full bg-transparent outline-none text-sm font-mono placeholder:text-white/30 text-white/90';
const Label = ({ children }: { children: React.ReactNode }) => <label className="block text-xs font-medium text-white/60 mb-1.5">{children}</label>;

/* Lo mínimo que necesita cada tipo para existir: Redis no guarda colecciones vacías. */
const NEEDS: Record<RedisKeyType, string> = {
  string: 'El valor de texto.',
  hash: 'Un primer campo con su valor; luego se agregan más.',
  list: 'Un primer elemento; luego se agregan más.',
  set: 'Un primer miembro; luego se agregan más.',
  zset: 'Un primer miembro con su puntuación.',
  stream: 'Una primera entrada: un campo=valor por línea.',
};

/** Clave nueva en la base elegida, con su primer valor y caducidad opcional. */
export const RedisNewKeyModal: React.FC<Props> = ({ isOpen, onClose, connectionId, sessionId, db, onCreated }) => {
  const edit = useRedisEdit(connectionId, sessionId, db);
  const [type, setType] = useState<RedisKeyType>('string');
  const [key, setKey] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [ttl, setTtl] = useState('');

  const reset = () => { setKey(''); setFirst(''); setSecond(''); setTtl(''); };
  const close = () => { reset(); onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: RedisEditInput = { op: 'create', key, type };
    if (ttl.trim()) {
      const secs = Number(ttl);
      if (!Number.isInteger(secs) || secs <= 0) { notify.error('Caducidad no válida', 'Escribe los segundos, un número entero mayor que 0.'); return; }
      input.ttl = secs;
    }
    switch (type) {
      case 'string': input.value = first; break;
      case 'hash': input.field = first; input.value = second; break;
      case 'list': input.value = first; break;
      case 'set': input.member = first; break;
      case 'zset': {
        const score = Number(second.trim());
        if (second.trim() === '' || !Number.isFinite(score)) { notify.error('Puntuación no válida', 'Debe ser un número.'); return; }
        input.member = first; input.score = score;
        break;
      }
      case 'stream': {
        const fields = parseStreamFields(first);
        if (!fields) { notify.error('Entrada no válida', 'Escribe un campo=valor por línea.'); return; }
        input.fields = fields;
        break;
      }
    }
    try {
      await edit.mutateAsync(input);
      notify.success('Clave creada', key);
      onCreated(key);
      close();
    } catch (err) {
      notify.error('No se pudo crear', messageOf(err));
    }
  };

  const multiline = type === 'string' || type === 'stream';

  return (
    <Modal isOpen={isOpen} onClose={close} title={`Nueva clave en db${db}`} size="md">
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-4">
          <div>
            <Label>Nombre *</Label>
            <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
              <input autoFocus required value={key} onChange={e => setKey(e.target.value)} placeholder="user:15" className={inputCls} />
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
              <Select value={type} onChange={setType} aria-label="Tipo de clave" className="flex-1 text-white/90"
                options={REDIS_KEY_TYPES.map(t => ({ value: t, label: REDIS_TYPE_LABELS[t] }))} />
            </div>
          </div>
        </div>

        <p className="text-xs text-white/45">{NEEDS[type]}</p>

        {type === 'hash' || type === 'zset' ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{type === 'hash' ? 'Campo *' : 'Miembro'}</Label>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input required={type === 'hash'} value={first} onChange={e => setFirst(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <Label>{type === 'hash' ? 'Valor' : 'Puntuación *'}</Label>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input required={type === 'zset'} inputMode={type === 'zset' ? 'decimal' : undefined} value={second} onChange={e => setSecond(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        ) : multiline ? (
          <div>
            <Label>{type === 'string' ? 'Valor' : 'Campos *'}</Label>
            <textarea value={first} onChange={e => setFirst(e.target.value)} rows={6} spellCheck={false}
              required={type === 'stream'} placeholder={type === 'stream' ? 'evento=login\nusuario=15' : undefined}
              className="w-full glass-input rounded-xl p-3.5 text-sm font-mono text-white/90 outline-none resize-y placeholder:text-white/30" />
          </div>
        ) : (
          <div>
            <Label>{type === 'list' ? 'Primer elemento' : 'Primer miembro'}</Label>
            <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
              <input value={first} onChange={e => setFirst(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        <div>
          <Label>Caduca en (segundos, opcional)</Label>
          <div className="glass-input rounded-xl h-11 flex items-center px-3.5 max-w-[12rem]">
            <input inputMode="numeric" value={ttl} onChange={e => setTtl(e.target.value)} placeholder="sin caducidad" className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" onClick={close}
            className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">Cancelar</button>
          <button type="submit" disabled={!key || edit.isPending || !sessionId}
            className="h-10 px-5 rounded-xl grad-brand text-white text-sm font-semibold disabled:opacity-50">
            {edit.isPending ? 'Creando…' : 'Crear clave'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
