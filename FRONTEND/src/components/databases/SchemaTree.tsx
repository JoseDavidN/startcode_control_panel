import React, { memo, useMemo, useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import type { DbIconName } from '@components/databases/icons';
import { useSchemaSection } from '@hooks/useDatabases';
import {
  displayName,
  indexSql,
  procedureSql,
  selectTableSql,
  triggerSql,
  type SqlDialect,
} from '@utils/sqlDialect';
import type {
  DatabaseSchema,
  SchemaIndex,
  SchemaProcedure,
  SchemaSection,
  SchemaTable,
  SchemaTrigger,
} from '@typings/database.types';

interface SchemaTreeProps {
  connectionId: string;
  /** Sesión de la vista: todas las secciones se piden por esa conexión. */
  sessionId: string;
  /** Comillas y sentencias del doble clic según el motor. */
  dialect: SqlDialect;
  schemas: DatabaseSchema[];
  /** Base sobre la que corre el editor. */
  activeSchema: string | null;
  onSelectSchema: (schema: string) => void;
  /** Base que arranca desplegada: la que fija la conexión, si fija alguna. */
  defaultExpanded?: string | null;
  /** Doble clic en un objeto: carga en el editor la sentencia para consultarlo. */
  onPick: (schema: string, sql: string) => void;
}

/* Solo transición de color: con cientos de filas, `mo-tab` (color, fondo,
   borde, sombra y opacidad) disparaba transiciones al pasar por encima mientras
   se desplazaba la lista. */
const rowCls = 'w-full flex items-center gap-1.5 h-8 px-2 rounded-lg text-left text-sm focus-ring transition-colors duration-100';
const childList = 'ml-[18px] pl-1 border-l border-line';

const Caret = ({ open }: { open: boolean }) => (
  <span className={`text-white/35 transition-transform ${open ? 'rotate-90' : ''}`}>
    <DbIcon name="chevron" className="w-3.5 h-3.5" />
  </span>
);

/** Buscador compacto del árbol (bases y tablas). */
const TreeSearch = ({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) => (
  <div className="glass-input rounded-lg h-8 flex items-center gap-2 px-2.5 my-1">
    <span className="text-white/35"><DbIcon name="search" className="w-3.5 h-3.5" /></span>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 min-w-0 bg-transparent outline-none text-xs text-white/90 placeholder:text-white/30"
    />
  </div>
);

const Hint = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) => (
  <li className={`px-3 py-1.5 text-xs ${tone === 'error' ? 'text-rose-300' : 'text-white/35'}`}>{children}</li>
);

/** Fila de un objeto sin hijos (trigger, índice, procedimiento). */
const LeafRow = ({ icon, iconTone, name, detail, title, onPick }: {
  icon: DbIconName; iconTone: string; name: string; detail?: string; title?: string; onPick: () => void;
}) => (
  <li>
    <button type="button" onDoubleClick={onPick} title={title}
      className={`${rowCls} text-white/70 hover:text-white hover:bg-tint-hover`}>
      <span className={`${iconTone} ml-[18px]`}><DbIcon name={icon} className="w-3.5 h-3.5" /></span>
      <span className="truncate font-mono text-[13px]">{name}</span>
      {detail && <span className="ml-auto pl-2 text-[10px] text-white/35 truncate shrink-0 max-w-[45%]">{detail}</span>}
    </button>
  </li>
);

/* ── Tabla o vista con sus columnas ───────────────────────────────── */
const TableNode = ({ table, onPick }: { table: SchemaTable; onPick: () => void }) => {
  const [open, setOpen] = useState(false);
  const isView = table.type === 'view';
  const label = displayName(table.name, table.namespace);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onDoubleClick={onPick}
        title={`${label} · doble clic para consultarla`}
        aria-expanded={open}
        className={`${rowCls} text-white/70 hover:text-white hover:bg-tint-hover`}
      >
        <Caret open={open} />
        <span className={isView ? 'text-sky-300' : 'text-violet-300'}>
          <DbIcon name={isView ? 'view' : 'table'} className="w-3.5 h-3.5" />
        </span>
        <span className="truncate flex-1 font-mono text-[13px]">{label}</span>
        {table.rows !== null && !isView && (
          <span className="text-[10px] text-white/30 tabular-nums shrink-0">{table.rows.toLocaleString()}</span>
        )}
      </button>

      {open && (
        <ul className={childList}>
          {table.columns.map(col => (
            <li key={col.name} className="flex items-center gap-1.5 h-7 px-2 text-xs min-w-0" title={`${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'}`}>
              <span className={col.key === 'PRI' ? 'text-amber-300' : 'text-white/30'}>
                <DbIcon name={col.key === 'PRI' ? 'key' : 'column'} className="w-3 h-3" />
              </span>
              <span className="font-mono text-white/70 truncate">{col.name}</span>
              <span className="font-mono text-white/30 truncate ml-auto pl-2">{col.type}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

/* ── Sección de una base ──────────────────────────────────────────── */
const SECTIONS: { id: SchemaSection; label: string; icon: DbIconName; tone: string }[] = [
  { id: 'tables',     label: 'Tablas',           icon: 'table',     tone: 'text-violet-300' },
  { id: 'views',      label: 'Vistas',           icon: 'view',      tone: 'text-sky-300' },
  { id: 'triggers',   label: 'Triggers',         icon: 'trigger',   tone: 'text-amber-300' },
  { id: 'indexes',    label: 'Índices',          icon: 'index',     tone: 'text-emerald-300' },
  { id: 'procedures', label: 'Procedimientos',   icon: 'procedure', tone: 'text-fuchsia-300' },
];

const errorText = (err: unknown) => (err as { message?: string })?.message ?? 'No se pudo cargar';

/* Cada sección pide su contenido la primera vez que se despliega. */
function SectionNode({ connectionId, sessionId, schema, section, dialect, onPick }: {
  connectionId: string; sessionId: string; schema: string; section: (typeof SECTIONS)[number]; dialect: SqlDialect; onPick: (sql: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useSchemaSection(connectionId, sessionId, schema, section.id, open);
  const items = (data ?? []) as unknown[];
  /* En PostgreSQL la sección reúne funciones y procedimientos. */
  const label = dialect === 'postgresql' && section.id === 'procedures' ? 'Funciones y procedimientos' : section.label;

  const content = (): React.ReactNode => {
    if (isLoading) return <Hint>Cargando…</Hint>;
    if (isError) return <Hint tone="error">{errorText(error)}</Hint>;
    if (items.length === 0) return <Hint>Sin {label.toLowerCase()}</Hint>;

    switch (section.id) {
      case 'tables':
      case 'views': {
        const term = search.trim().toLowerCase();
        const tables = (data as SchemaTable[]).filter(t => !term || displayName(t.name, t.namespace).toLowerCase().includes(term));
        return (
          <>
            {section.id === 'tables' && (
              <li className="pr-1"><TreeSearch value={search} onChange={setSearch} placeholder="Buscar tabla…" /></li>
            )}
            {tables.length === 0 && <Hint>Ninguna tabla coincide</Hint>}
            {tables.map(t => (
              <TableNode key={`${t.namespace ?? ''}.${t.name}`} table={t} onPick={() => onPick(selectTableSql(dialect, t.name, t.namespace))} />
            ))}
          </>
        );
      }
      case 'triggers':
        return (data as SchemaTrigger[]).map(t => (
          <LeafRow key={`${t.namespace ?? ''}.${t.table}.${t.name}`} icon="trigger" iconTone={section.tone} name={t.name}
            detail={`${t.timing} ${t.event} · ${displayName(t.table, t.namespace)}`}
            title={`${t.timing} ${t.event} ON ${t.table} · doble clic para ver su definición`}
            onPick={() => onPick(triggerSql(dialect, t))} />
        ));
      case 'indexes':
        return (data as SchemaIndex[]).map(ix => (
          <LeafRow key={`${ix.namespace ?? ''}.${ix.table}.${ix.name}`} icon="index" iconTone={section.tone}
            name={`${displayName(ix.table, ix.namespace)}.${ix.name}`}
            detail={`${ix.unique ? 'UNIQUE · ' : ''}${ix.columns.join(', ')}`}
            title={`${ix.name} en ${ix.table} (${ix.columns.join(', ')}) · ${ix.type}${ix.unique ? ' · único' : ''} · doble clic para ver los índices de la tabla`}
            onPick={() => onPick(indexSql(dialect, ix))} />
        ));
      case 'procedures':
        return (data as SchemaProcedure[]).map(p => (
          <LeafRow key={`${p.namespace ?? ''}.${p.name}(${p.params})`} icon="procedure" iconTone={section.tone}
            name={displayName(p.name, p.namespace)}
            detail={p.params ? `(${p.params})` : '()'}
            title={`${p.kind === 'function' ? 'Función' : 'Procedimiento'} ${p.name}(${p.params})${p.comment ? `\n${p.comment}` : ''}\nDoble clic para ver su definición`}
            onPick={() => onPick(procedureSql(dialect, p))} />
        ));
    }
  };

  return (
    <li>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`${rowCls} text-white/65 hover:text-white hover:bg-tint-hover`}>
        <Caret open={open} />
        <span className={section.tone}><DbIcon name={section.icon} className="w-3.5 h-3.5" /></span>
        <span className="flex-1 truncate text-[13px]">{label}</span>
        {data && <span className="text-[10px] text-white/30 tabular-nums shrink-0">{items.length}</span>}
      </button>
      {open && <ul className={childList}>{content()}</ul>}
    </li>
  );
}

/* ── Base de datos ────────────────────────────────────────────────── */
const SchemaNode = ({ connectionId, sessionId, dialect, schema, active, defaultOpen, onSelect, onPick }: {
  connectionId: string;
  sessionId: string;
  dialect: SqlDialect;
  schema: DatabaseSchema;
  active: boolean;
  defaultOpen: boolean;
  onSelect: () => void;
  onPick: (schema: string, sql: string) => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); onSelect(); }}
        aria-expanded={open}
        className={`${rowCls} ${active
          ? 'grad-brand-soft text-white'
          : schema.system ? 'text-white/40 hover:text-white/80 hover:bg-tint-hover' : 'text-white/75 hover:text-white hover:bg-tint-hover'}`}
      >
        <Caret open={open} />
        <span className={active ? 'text-violet-200' : 'text-white/45'}><DbIcon name="database" className="w-3.5 h-3.5" /></span>
        <span className="truncate flex-1 font-medium">{schema.name}</span>
      </button>

      {open && (
        <ul className={childList}>
          {SECTIONS.map(section => (
            <SectionNode key={section.id} connectionId={connectionId} sessionId={sessionId} schema={schema.name} section={section} dialect={dialect}
              onPick={sql => onPick(schema.name, sql)} />
          ))}
        </ul>
      )}
    </li>
  );
};

/* `memo`: no se re-renderiza con cada tecla del editor. */
export const SchemaTree = memo(function SchemaTree({
  connectionId, sessionId, dialect, schemas, activeSchema, onSelectSchema, onPick, defaultExpanded = null,
}: SchemaTreeProps) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? schemas.filter(s => s.name.toLowerCase().includes(term)) : schemas;
  }, [schemas, search]);

  return (
    <>
      {schemas.length > 1 && <TreeSearch value={search} onChange={setSearch} placeholder="Buscar base de datos…" />}
      <ul className="space-y-0.5 mt-1">
        {visible.length === 0 && <Hint>Ninguna base coincide</Hint>}
        {visible.map(s => (
          <SchemaNode
            key={s.name}
            connectionId={connectionId}
            sessionId={sessionId}
            dialect={dialect}
            schema={s}
            active={activeSchema === s.name}
            defaultOpen={s.name === defaultExpanded}
            onSelect={() => onSelectSchema(s.name)}
            onPick={onPick}
          />
        ))}
      </ul>
    </>
  );
});
