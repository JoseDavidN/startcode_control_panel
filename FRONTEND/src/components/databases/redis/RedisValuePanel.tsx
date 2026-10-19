import React, { useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import { Modal } from '@components/common/Modal';
import { Field, TypeBadge } from '@components/databases/redis/redisUi';
import { iconBtn, messageOf, smallBtn } from '@components/databases/redis/redisStyles';
import { useRedisDelete, useRedisEdit, useRedisKey } from '@hooks/useRedis';
import { copyText } from '@lib/clipboard';
import { notify } from '@services/notification.service';
import { formatBytes } from '@utils/metrics';
import { formatTtl, parseStreamFields } from '@utils/redis';
import { REDIS_TYPE_LABELS, type RedisEditInput, type RedisKeyDetail, type RedisKeyType } from '@typings/redis.types';

interface Props {
  connectionId: string;
  sessionId: string | null;
  db: number;
  keyName: string;
  /** La clave ya no existe (borrada aquí o renombrada): la vista vuelve a la lista. */
  onGone: (renamedTo?: string) => void;
}

type Apply = (input: Omit<RedisEditInput, 'key'>, ok: string) => Promise<boolean>;

/**
 * Valor de una clave con su editor según el tipo, más caducidad, renombrar y
 * borrar. Lo que se muestra es lo último leído: cada cambio vuelve a pedirlo.
 */
export const RedisValuePanel: React.FC<Props> = ({ connectionId, sessionId, db, keyName, onGone }) => {
  const { data, isLoading, error, refetch, isFetching } = useRedisKey(connectionId, sessionId, db, keyName);
  const edit = useRedisEdit(connectionId, sessionId, db);
  const remove = useRedisDelete(connectionId, sessionId, db);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply: Apply = async (input, ok) => {
    try {
      await edit.mutateAsync({ ...input, key: keyName } as RedisEditInput);
      notify.success(ok);
      return true;
    } catch (err) {
      notify.error('No se pudo guardar', messageOf(err));
      return false;
    }
  };

  const doDelete = async () => {
    try {
      await remove.mutateAsync([keyName]);
      notify.success('Clave borrada');
      setConfirmDelete(false);
      onGone();
    } catch (err) {
      notify.error('No se pudo borrar', messageOf(err));
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" /></div>;
  }
  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <span className="text-rose-300/70"><DbIcon name="alert" className="w-8 h-8" /></span>
        <p className="text-sm text-white/60">{messageOf(error)}</p>
        <button type="button" className={smallBtn} onClick={() => onGone()}>Volver a la lista</button>
      </div>
    );
  }

  return (
    <>
      <KeyHeader detail={data} busy={edit.isPending} refreshing={isFetching} apply={apply}
        onRefresh={() => void refetch()} onDelete={() => setConfirmDelete(true)}
        onRenamed={newKey => onGone(newKey)} />

      {data.truncated && (
        <p className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-400/20 text-[11px] text-amber-200/90">
          {data.type === 'string'
            ? `Se muestran los primeros 256 KB de ${formatBytes(data.length)}: el texto no se puede editar desde aquí (usa la consola).`
            : `Se muestran ${data.type === 'stream' ? 'las 200 entradas más recientes' : 'los primeros 500 elementos'} de ${data.length.toLocaleString('es')}.`}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-auto scroll-thin p-4">
        <ValueBody detail={data} apply={apply} busy={edit.isPending} />
      </div>

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Borrar clave" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-white/75">Se borrará la clave y todo su contenido. No se puede deshacer y queda en la auditoría de la conexión.</p>
          <pre className="p-3 rounded-lg bg-tint-sunken border border-hairline-soft text-xs font-mono text-white/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto scroll-thin">{keyName}</pre>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">Cancelar</button>
            <button type="button" onClick={() => void doDelete()} disabled={remove.isPending}
              className="h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold disabled:opacity-50">
              {remove.isPending ? 'Borrando…' : 'Borrar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

/* ── Cabecera: nombre, tipo, tamaño, caducidad y acciones ── */
const KeyHeader = ({ detail, busy, refreshing, apply, onRefresh, onDelete, onRenamed }: {
  detail: RedisKeyDetail;
  busy: boolean;
  refreshing: boolean;
  apply: Apply;
  onRefresh: () => void;
  onDelete: () => void;
  onRenamed: (newKey: string) => void;
}) => {
  const [mode, setMode] = useState<'ttl' | 'rename' | null>(null);
  const [draft, setDraft] = useState('');
  const open = (m: 'ttl' | 'rename') => {
    setMode(m);
    setDraft(m === 'rename' ? detail.key : detail.ttl > 0 ? String(Math.ceil(detail.ttl / 1000)) : '');
  };

  const save = async () => {
    if (mode === 'rename') {
      const next = draft;
      if (!next || next === detail.key) { setMode(null); return; }
      if (await apply({ op: 'rename', newKey: next }, 'Clave renombrada')) { setMode(null); onRenamed(next); }
    } else if (mode === 'ttl') {
      const secs = Number(draft);
      if (!Number.isInteger(secs) || secs <= 0) { notify.error('Caducidad no válida', 'Escribe los segundos, un número entero mayor que 0.'); return; }
      if (await apply({ op: 'expire', ttl: secs }, 'Caducidad actualizada')) setMode(null);
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    if (e.key === 'Escape') setMode(null);
  };
  const size = detail.type === 'string' ? formatBytes(detail.length) : `${detail.length.toLocaleString('es')} ${detail.type === 'stream' ? 'entradas' : 'elementos'}`;

  return (
    <div className="px-4 py-3 border-b border-line shrink-0 space-y-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <TypeBadge type={detail.type} />
        <h3 className="flex-1 min-w-0 text-sm font-semibold font-mono truncate" title={detail.key}>{detail.key}</h3>
        <button type="button" className={iconBtn} title="Copiar el nombre"
          onClick={() => { copyText(detail.key).then(() => notify.success('Nombre copiado'), () => notify.error('No se pudo copiar')); }}>
          <DbIcon name="copy" className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={iconBtn} title="Volver a leer" onClick={onRefresh}>
          <DbIcon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" className={smallBtn} onClick={() => open('rename')} disabled={busy}>
          <DbIcon name="edit" className="w-3.5 h-3.5" />Renombrar
        </button>
        <button type="button" onClick={onDelete}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 ring-1 ring-rose-400/20 text-xs font-medium shrink-0">
          <DbIcon name="trash" className="w-3.5 h-3.5" />Borrar
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/45 flex-wrap">
        <span>{REDIS_TYPE_LABELS[detail.type as RedisKeyType] ?? detail.type}</span>
        <span className="text-white/20">·</span>
        <span>{size}</span>
        {detail.memory !== null && (<><span className="text-white/20">·</span><span title="Memoria que ocupa (MEMORY USAGE)">{formatBytes(detail.memory)} en memoria</span></>)}
        <span className="text-white/20">·</span>
        <button type="button" onClick={() => open('ttl')} title="Cambiar la caducidad"
          className="inline-flex items-center gap-1 hover:text-white transition-colors">
          {detail.ttl < 0 ? 'Sin caducidad' : `Caduca en ${formatTtl(detail.ttl)}`}
          <DbIcon name="edit" className="w-3 h-3" />
        </button>
      </div>

      {mode && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/55 shrink-0">{mode === 'rename' ? 'Nombre nuevo' : 'Caduca en (segundos)'}</span>
          <Field autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
            inputMode={mode === 'ttl' ? 'numeric' : undefined} className="flex-1" placeholder={mode === 'ttl' ? '3600' : undefined} />
          <button type="button" className={smallBtn} disabled={busy} onClick={() => void save()}>Guardar</button>
          {mode === 'ttl' && detail.ttl >= 0 && (
            <button type="button" className={smallBtn} disabled={busy}
              onClick={() => { void apply({ op: 'expire', ttl: null }, 'Caducidad quitada').then(ok => { if (ok) setMode(null); }); }}>
              Quitar caducidad
            </button>
          )}
          <button type="button" className={iconBtn} title="Cancelar" onClick={() => setMode(null)}><DbIcon name="close" className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
};

/* ── Cuerpo según el tipo ── */
const ValueBody = ({ detail, apply, busy }: { detail: RedisKeyDetail; apply: Apply; busy: boolean }) => {
  switch (detail.type) {
    case 'string':
      /* key: al leer otro valor (otra clave o un cambio desde la consola) el borrador vuelve a empezar. */
      return <StringEditor key={`${detail.key}\u0000${detail.value as string}`} value={detail.value as string} readOnly={detail.truncated} apply={apply} busy={busy} />;
    case 'hash':
      return <HashEditor rows={detail.value as { field: string; value: string }[]} apply={apply} busy={busy} />;
    case 'list':
      return <ListEditor items={detail.value as string[]} apply={apply} busy={busy} />;
    case 'set':
      return <SetEditor members={detail.value as string[]} apply={apply} busy={busy} />;
    case 'zset':
      return <ZsetEditor rows={detail.value as { member: string; score: string }[]} apply={apply} busy={busy} />;
    case 'stream':
      return <StreamEditor entries={detail.value as { id: string; fields: [string, string][] }[]} apply={apply} busy={busy} />;
    default:
      return (
        <div className="edge-dashed rounded-xl py-10 px-6 text-center text-sm text-white/55">
          El tipo <span className="font-mono text-white/80">{detail.type}</span> es de un módulo de Redis: su valor se lee y se cambia desde la consola.
        </div>
      );
  }
};

function prettyJson(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

const StringEditor = ({ value, readOnly, apply, busy }: { value: string; readOnly: boolean; apply: Apply; busy: boolean }) => {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;
  const pretty = prettyJson(draft);
  return (
    <div className="h-full flex flex-col gap-3">
      <textarea value={draft} onChange={e => setDraft(e.target.value)} readOnly={readOnly} spellCheck={false}
        aria-label="Valor"
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty && !readOnly) void apply({ op: 'set', value: draft }, 'Valor guardado'); } }}
        className="flex-1 min-h-[8rem] w-full glass-input rounded-xl p-3 text-xs font-mono text-white/90 outline-none resize-none scroll-thin" />
      <div className="flex items-center gap-2">
        {pretty !== null && pretty !== draft && !readOnly && (
          <button type="button" className={smallBtn} onClick={() => setDraft(pretty)} title="Indenta el JSON (no se guarda hasta pulsar Guardar)">
            Formatear JSON
          </button>
        )}
        <span className="flex-1 text-[11px] text-white/35">{readOnly ? 'Solo lectura' : 'Ctrl + S guarda · la caducidad se conserva'}</span>
        {dirty && !readOnly && <button type="button" className={smallBtn} onClick={() => setDraft(value)}>Descartar</button>}
        <button type="button" disabled={!dirty || readOnly || busy} onClick={() => void apply({ op: 'set', value: draft }, 'Valor guardado')}
          className="h-8 px-4 rounded-lg grad-brand text-white text-xs font-semibold disabled:opacity-40">
          Guardar
        </button>
      </div>
    </div>
  );
};

/* Celda con edición en línea: doble clic o el lápiz; Enter guarda, Escape cancela. */
const EditableCell = ({ value, onSave, busy }: { value: string; onSave: (v: string) => Promise<boolean>; busy: boolean }) => {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <div className="flex items-start gap-1.5 group/cell">
        <span className="flex-1 min-w-0 whitespace-pre-wrap break-all cursor-pointer" onDoubleClick={() => setDraft(value)}>{value === '' ? <span className="text-white/30 italic">vacío</span> : value}</span>
        <button type="button" className={`${iconBtn} opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100`} title="Editar" onClick={() => setDraft(value)}>
          <DbIcon name="edit" className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
  const save = async () => { if (draft === value || await onSave(draft)) setDraft(null); };
  return (
    <div className="flex items-center gap-1.5">
      <Field autoFocus value={draft} onChange={e => setDraft(e.target.value)} className="flex-1"
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } if (e.key === 'Escape') setDraft(null); }} />
      <button type="button" className={iconBtn} title="Guardar" disabled={busy} onClick={() => void save()}><DbIcon name="check" className="w-3.5 h-3.5" /></button>
      <button type="button" className={iconBtn} title="Cancelar" onClick={() => setDraft(null)}><DbIcon name="close" className="w-3.5 h-3.5" /></button>
    </div>
  );
};

const DeleteBtn = ({ onClick, busy, title = 'Quitar' }: { onClick: () => void; busy: boolean; title?: string }) => (
  <button type="button" className={`${iconBtn} hover:text-rose-300`} title={title} disabled={busy} onClick={onClick}>
    <DbIcon name="trash" className="w-3.5 h-3.5" />
  </button>
);

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <table className="data-table w-full text-xs font-mono border-separate border-spacing-0">
    <thead>
      <tr>
        {head.map(h => <th key={h} className="sticky top-0 z-10 sticky-cell px-3 h-8 text-left text-white/60 font-semibold whitespace-nowrap border-b border-line">{h}</th>)}
        <th className="sticky top-0 z-10 sticky-cell w-10 border-b border-line" />
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);
const td = 'px-3 py-1.5 align-top border-b border-hairline-soft';

/* Formulario de alta al pie de cada colección. */
const AddRow = ({ children }: { children: React.ReactNode }) => (
  <div className="sticky bottom-0 mt-3 flex items-center gap-2 p-2 rounded-xl glass-soft">{children}</div>
);

const HashEditor = ({ rows, apply, busy }: { rows: { field: string; value: string }[]; apply: Apply; busy: boolean }) => {
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const add = async () => {
    if (!field) return;
    const exists = rows.some(r => r.field === field);
    if (await apply({ op: 'hset', field, value }, exists ? 'Campo actualizado' : 'Campo agregado')) { setField(''); setValue(''); }
  };
  return (
    <>
      <Table head={['Campo', 'Valor']}>
        {rows.map(r => (
          <tr key={r.field}>
            <td className={`${td} text-violet-200/90 whitespace-pre-wrap break-all w-1/3`}>{r.field}</td>
            <td className={td}><EditableCell value={r.value} busy={busy} onSave={v => apply({ op: 'hset', field: r.field, value: v }, 'Campo actualizado')} /></td>
            <td className={td}><DeleteBtn busy={busy} title="Quitar el campo" onClick={() => void apply({ op: 'hdel', field: r.field }, 'Campo quitado')} /></td>
          </tr>
        ))}
      </Table>
      <AddRow>
        <Field placeholder="campo" value={field} onChange={e => setField(e.target.value)} className="w-1/3" />
        <Field placeholder="valor" value={value} onChange={e => setValue(e.target.value)} className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
        <button type="button" className={smallBtn} disabled={!field || busy} onClick={() => void add()}>Agregar</button>
      </AddRow>
    </>
  );
};

const ListEditor = ({ items, apply, busy }: { items: string[]; apply: Apply; busy: boolean }) => {
  const [value, setValue] = useState('');
  const push = async (op: 'lpush' | 'rpush') => {
    if (await apply({ op, value }, op === 'lpush' ? 'Agregado al inicio' : 'Agregado al final')) setValue('');
  };
  return (
    <>
      <Table head={['#', 'Valor']}>
        {items.map((v, i) => (
          <tr key={`${i}\u0000${v}`}>
            <td className={`${td} text-white/40 w-12 tabular-nums`}>{i}</td>
            <td className={td}><EditableCell value={v} busy={busy} onSave={next => apply({ op: 'lset', index: i, value: next }, 'Elemento actualizado')} /></td>
            <td className={td}><DeleteBtn busy={busy} onClick={() => void apply({ op: 'lremIndex', index: i }, 'Elemento quitado')} /></td>
          </tr>
        ))}
      </Table>
      <AddRow>
        <Field placeholder="valor" value={value} onChange={e => setValue(e.target.value)} className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter') void push('rpush'); }} />
        <button type="button" className={smallBtn} disabled={busy} onClick={() => void push('lpush')}>Al inicio</button>
        <button type="button" className={smallBtn} disabled={busy} onClick={() => void push('rpush')}>Al final</button>
      </AddRow>
    </>
  );
};

const SetEditor = ({ members, apply, busy }: { members: string[]; apply: Apply; busy: boolean }) => {
  const [member, setMember] = useState('');
  const add = async () => {
    if (members.includes(member)) { notify.info('Ya está en el conjunto'); return; }
    if (await apply({ op: 'sadd', member }, 'Miembro agregado')) setMember('');
  };
  return (
    <>
      <Table head={['Miembro']}>
        {members.map(m => (
          <tr key={m}>
            <td className={`${td} whitespace-pre-wrap break-all`}>{m === '' ? <span className="text-white/30 italic">vacío</span> : m}</td>
            <td className={td}><DeleteBtn busy={busy} onClick={() => void apply({ op: 'srem', member: m }, 'Miembro quitado')} /></td>
          </tr>
        ))}
      </Table>
      <AddRow>
        <Field placeholder="miembro" value={member} onChange={e => setMember(e.target.value)} className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
        <button type="button" className={smallBtn} disabled={busy} onClick={() => void add()}>Agregar</button>
      </AddRow>
    </>
  );
};

const ZsetEditor = ({ rows, apply, busy }: { rows: { member: string; score: string }[]; apply: Apply; busy: boolean }) => {
  const [member, setMember] = useState('');
  const [score, setScore] = useState('');
  const toScore = (text: string): number | null => {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(n)) { notify.error('Puntuación no válida', 'Debe ser un número.'); return null; }
    return n;
  };
  const add = async () => {
    const n = toScore(score);
    if (n === null) return;
    if (await apply({ op: 'zadd', member, score: n }, 'Miembro guardado')) { setMember(''); setScore(''); }
  };
  return (
    <>
      <Table head={['Puntuación', 'Miembro']}>
        {rows.map(r => (
          <tr key={r.member}>
            <td className={`${td} w-40 tabular-nums`}>
              <EditableCell value={r.score} busy={busy} onSave={async v => {
                const n = toScore(v);
                return n === null ? false : apply({ op: 'zadd', member: r.member, score: n }, 'Puntuación actualizada');
              }} />
            </td>
            <td className={`${td} whitespace-pre-wrap break-all`}>{r.member}</td>
            <td className={td}><DeleteBtn busy={busy} onClick={() => void apply({ op: 'zrem', member: r.member }, 'Miembro quitado')} /></td>
          </tr>
        ))}
      </Table>
      <AddRow>
        <Field placeholder="puntuación" inputMode="decimal" value={score} onChange={e => setScore(e.target.value)} className="w-32" />
        <Field placeholder="miembro" value={member} onChange={e => setMember(e.target.value)} className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
        <button type="button" className={smallBtn} disabled={busy} onClick={() => void add()}>Agregar</button>
      </AddRow>
    </>
  );
};

const StreamEditor = ({ entries, apply, busy }: { entries: { id: string; fields: [string, string][] }[]; apply: Apply; busy: boolean }) => {
  const [text, setText] = useState('');
  const add = async () => {
    const fields = parseStreamFields(text);
    if (!fields) { notify.error('Entrada no válida', 'Escribe un campo=valor por línea.'); return; }
    if (await apply({ op: 'xadd', fields }, 'Entrada agregada')) setText('');
  };
  return (
    <>
      <Table head={['Id', 'Campos']}>
        {entries.map(e => (
          <tr key={e.id}>
            <td className={`${td} text-white/50 whitespace-nowrap w-48`}>{e.id}</td>
            <td className={td}>
              <div className="flex flex-wrap gap-1.5">
                {e.fields.map(([f, v], i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded-md bg-tint-sunken ring-1 ring-hairline-soft break-all">
                    <span className="text-violet-200/90">{f}</span><span className="text-white/30">=</span>{v}
                  </span>
                ))}
              </div>
            </td>
            <td className={td}><DeleteBtn busy={busy} title="Quitar la entrada" onClick={() => void apply({ op: 'xdel', id: e.id }, 'Entrada quitada')} /></td>
          </tr>
        ))}
      </Table>
      <AddRow>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} spellCheck={false}
          placeholder={'campo=valor (uno por línea)'} aria-label="Campos de la entrada nueva"
          className="flex-1 glass-input rounded-lg px-2.5 py-1.5 text-xs font-mono text-white/90 outline-none resize-none placeholder:text-white/30" />
        <button type="button" className={smallBtn} disabled={busy || !text.trim()} onClick={() => void add()}>Agregar entrada</button>
      </AddRow>
    </>
  );
};
