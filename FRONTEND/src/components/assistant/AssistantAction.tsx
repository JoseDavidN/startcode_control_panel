import { osLabel } from '@utils/servers';
import { tagLabel } from '@utils/tags';
import { DATABASE_ENGINE_LABELS } from '@typings/database.types';
import type { AssistantAction } from '@components/assistant/assistantActions';

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ServerIcon = () => <svg {...sp} className="w-4 h-4"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>;
const DatabaseIcon = () => <svg {...sp} className="w-4 h-4"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
const LockIcon = () => <svg {...sp} className="w-3 h-3"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;

const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
  value === undefined || value === null || value === '' ? null : (
    <div className="flex gap-3 text-xs">
      <span className="w-20 shrink-0 text-white/40">{label}</span>
      <span className="min-w-0 break-all text-white/85 font-mono">{value}</span>
    </div>
  );

export const AssistantActionCard = ({ action, onReview }: { action: AssistantAction; onReview: (a: AssistantAction) => void }) => {
  const server = action.kind === 'server';
  const d = action.data;
  return (
    <div className="glass-soft rounded-xl border border-hairline my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line">
        <span className="text-violet-200">{server ? <ServerIcon /> : <DatabaseIcon />}</span>
        <span className="text-xs font-semibold text-white/90">{server ? 'Nuevo servidor propuesto' : 'Nueva conexión propuesta'}</span>
      </div>
      <div className="px-3 py-2.5 space-y-1">
        {action.kind === 'server' ? (
          <>
            <Row label="Nombre" value={action.data.name} />
            <Row label="Host" value={action.data.host && `${action.data.host}:${action.data.port ?? 22}`} />
            <Row label="Usuario" value={action.data.username} />
            <Row label="Sistema" value={action.data.os && osLabel(action.data.os)} />
            <Row label="Etiqueta" value={action.data.tag ? tagLabel(action.data.tag) : undefined} />
            <Row label="Descripción" value={action.data.description} />
          </>
        ) : (
          <>
            <Row label="Motor" value={action.data.engine && DATABASE_ENGINE_LABELS[action.data.engine]} />
            <Row label="Nombre" value={action.data.name} />
            <Row label="Host" value={action.data.host && `${action.data.host}${action.data.port ? `:${action.data.port}` : ''}`} />
            <Row label="Usuario" value={action.data.username} />
            <Row label="Base" value={action.data.database} />
            <Row label="Etiqueta" value={action.data.tag ? tagLabel(action.data.tag) : undefined} />
          </>
        )}
        {Object.keys(d).length === 0 && <p className="text-xs text-white/45">Sin datos: completa el formulario.</p>}
      </div>
      <div className="flex items-center gap-2 px-3 pb-3">
        <span className="flex-1 text-[10px] text-white/40 inline-flex items-center gap-1">
          <LockIcon /> {server ? 'La llave SSH la pegas tú en el formulario.' : 'La contraseña la escribes tú en el formulario.'}
        </span>
        <button type="button" onClick={() => onReview(action)}
          className="mo-tab h-8 px-3 rounded-lg grad-brand text-white text-xs font-semibold elev-brand-sm shrink-0">
          Revisar y crear
        </button>
      </div>
    </div>
  );
};
