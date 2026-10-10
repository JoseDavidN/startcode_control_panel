import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '@components/common/Modal';
import { CloudIcon } from '@components/cloud/icons';
import { folderNameError } from '@utils/cloud';
import type { CloudFolder } from '@typings/cloud.types';

/* ── Nueva carpeta dentro de la abierta ──────────────────────────────
   Se monta solo mientras está abierto: cada apertura empieza vacía. */
export const CreateFolderModal = ({
  parent, onCreate, onClose,
}: {
  parent: CloudFolder;
  onCreate: (name: string) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  /* El error se muestra después del primer intento, no mientras se escribe la primera letra. */
  const [tried, setTried] = useState(false);
  const error = folderNameError(name, parent.children);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (error) return;
    onCreate(name.trim());
  };

  return (
    <Modal isOpen onClose={onClose} title="Nueva carpeta" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="cloud-new-folder" className="block text-xs font-medium text-white/55 mb-1.5">Nombre</label>
          <div className={`glass-input rounded-xl h-11 flex items-center gap-2 px-3.5 transition ${tried && error ? 'ring-1 ring-rose-400/40' : ''}`}>
            <span className="text-white/40"><CloudIcon name="folder" className="w-4 h-4" /></span>
            <input id="cloud-new-folder" autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Carpeta sin título" maxLength={120} autoComplete="off"
              aria-invalid={tried && Boolean(error)} aria-describedby="cloud-new-folder-hint"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-white/30 text-white" />
          </div>
          <p id="cloud-new-folder-hint" className={`text-xs mt-1.5 ${tried && error ? 'text-rose-300' : 'text-white/40'}`}>
            {tried && error ? error : <>Se creará en <span className="text-white/65">«{parent.name}»</span>.</>}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" onClick={onClose}
            className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
            Cancelar
          </button>
          <button type="submit" disabled={tried && Boolean(error)}
            className="grad-brand text-sm font-semibold px-4 h-10 rounded-xl elev-brand hover:elev-brand-hi transition disabled:opacity-50">
            Crear carpeta
          </button>
        </div>
      </form>
    </Modal>
  );
};
