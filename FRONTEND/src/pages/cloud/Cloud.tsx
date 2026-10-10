import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudSidebar } from '@components/cloud/CloudSidebar';
import { CloudExplorer } from '@components/cloud/CloudExplorer';
import { FileViewerModal } from '@components/cloud/FileViewerModal';
import { CloudSettingsModal, type CloudSettingsTab } from '@components/cloud/CloudSettingsModal';
import { DeleteEntryModal, MoveEntryModal, RenameEntryModal } from '@components/cloud/EntryActionModals';
import { EntryDetailsModal } from '@components/cloud/EntryDetailsModal';
import {
  CLOUD_FILE_TYPE_LABELS, CLOUD_SECTIONS, DEFAULT_CLOUD_FILTERS, describeDrop, findFolderPath, isPreviewable, resolvePath,
} from '@utils/cloud';
import { downloadBlob } from '@lib/download';
import { ROUTES } from '@utils/constants';
import { cloudApi, cloudErrorMessage } from '@services/cloud.api';
import { useCloudNotices } from '@hooks/useCloudNotices';
import { useCloudPinned } from '@hooks/useCloudPinned';
import { useCloudConnection } from '@hooks/useCloudConnection';
import { emptyRoot, useCloudPathsConfig, useCloudRefresh, useCloudStorage, useCloudTree } from '@hooks/useCloudData';
import type { PickedFile } from '@lib/filePicker';
import type { CloudEntry, CloudFile, CloudFilters, CloudFolder, CloudPaths, CloudSection, CloudView } from '@typings/cloud.types';

/** Subidas en paralelo: varias a la vez sin saturar la red ni la nube. */
const UPLOAD_CONCURRENCY = 3;

/* ── Gestión de StartCode Cloud ───────────────────────────────────────
   Dos columnas en el alto del contenedor: navegación de la nube (20 %) y
   contenido (80 %). Los datos vienen del backend de la nube (`CLOUD/`)
   con la conexión guardada en el equipo; sin conexión se ven las secciones
   vacías y la configuración se abre en la pestaña Conexión. */
export const Cloud: React.FC = () => {
  const cloud = useCloudConnection();
  const connected = cloud.status === 'connected';
  const { connection } = cloud;
  const refresh = useCloudRefresh(connection);

  const [section, setSection] = useState<CloudSection>('home');
  /* Cada sección recuerda su carpeta abierta (ids bajo su raíz; vacío = la
     raíz), así volver a un tab deja donde se estaba. */
  const [paths, setPaths] = useState<Record<CloudSection, string[]>>({ home: [], backups: [] });
  const path = paths[section];
  const setPath = (update: (prev: string[]) => string[]) => setPaths(p => ({ ...p, [section]: update(p[section]) }));
  const [filters, setFilters] = useState<CloudFilters>(DEFAULT_CLOUD_FILTERS);
  const [view, setView] = useState<CloudView>('grid');

  const homeTree = useCloudTree(connection, 'home', connected);
  const backupsTree = useCloudTree(connection, 'backups', connected);
  const roots = useMemo<Record<CloudSection, CloudFolder>>(() => ({
    home: (connected && homeTree.data) || emptyRoot('home'),
    backups: (connected && backupsTree.data) || emptyRoot('backups'),
  }), [connected, homeTree.data, backupsTree.data]);
  const root = roots[section];
  const trail = useMemo(() => resolvePath(root, path), [root, path]);
  /* Ruta relativa de la carpeta abierta para la API ('' = raíz de la sección). */
  const currentRel = trail.length > 1 ? trail[trail.length - 1].id : '';

  const storageQuery = useCloudStorage(connection, connected);
  const storage = (connected && storageQuery.data) || { used: 0, total: 0 };
  const { notices, info, startUpload, dismiss } = useCloudNotices();

  const [preview, setPreview] = useState<{ file: CloudFile; section: CloudSection } | null>(null);

  /* ── Configuración. Sin conexión (tras comprobar la guardada) lo primero
     es conectar: el modal se muestra solo y no se cierra hasta lograrlo. ── */
  const navigateTo = useNavigate();
  const [settings, setSettings] = useState<{ tab: CloudSettingsTab } | null>(null);
  const mustConnect = cloud.status === 'disconnected';
  const savePaths = (next: CloudPaths) => {
    setSettings(null);
    setPaths({ home: [], backups: [] });
    info('Configuración guardada', `Home: ${next.home} · Backups: ${next.backups}`);
  };

  /* Un error de la nube como aviso de Cloud. */
  const fail = (title: string) => (error: unknown) => info(title, cloudErrorMessage(error));

  /* El lector pide el contenido a la sección de donde se abrió el archivo. */
  const previewSection = preview?.section;
  const contentOf = useCallback(
    (file: CloudFile) => cloudApi.content(previewSection ?? 'home', file.id),
    [previewSection],
  );

  /* Archivos: tal cual. Carpetas: la nube las comprime en .zip. */
  const downloadFrom = (sec: CloudSection, entry: CloudEntry) => {
    if (entry.kind === 'folder') {
      info(`Preparando «${entry.name}.zip»`, 'La descarga empieza cuando la nube termine de comprimir la carpeta.');
      cloudApi.zip(sec, entry.id).then(blob => downloadBlob(blob, `${entry.name}.zip`), fail('No se pudo descargar'));
      return;
    }
    cloudApi.content(sec, entry.id).then(blob => downloadBlob(blob, entry.name), fail('No se pudo descargar'));
  };
  const download = (entry: CloudEntry) => downloadFrom(section, entry);

  const openFile = (file: CloudFile) => {
    if (isPreviewable(file.type)) setPreview({ file, section });
    else info('Sin vista previa', `Los archivos de tipo ${CLOUD_FILE_TYPE_LABELS[file.type].toLowerCase()} se pueden descargar con clic derecho.`);
  };

  /* La carga va a la carpeta abierta al soltar, aunque luego se navegue.
     El aviso suma el progreso real de todos los archivos. */
  const upload = (files: PickedFile[]) => {
    if (!connected) {
      info('La nube no está conectada', 'Conéctala desde el engranaje de Cloud para cargar archivos.');
      return;
    }
    const sec = section;
    const parent = currentRel;
    const destination = trail[trail.length - 1].name;
    const control = startUpload({ ...describeDrop(files), destination });
    const sent = new Map<PickedFile, number>();
    const report = () => control.progress([...sent.values()].reduce((a, b) => a + b, 0));
    const queue = [...files];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const current = file;
        await cloudApi.upload(sec, parent, current, loaded => { sent.set(current, loaded); report(); });
        sent.set(current, current.size);
        report();
      }
    };
    void Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker))
      .then(() => control.done(), error => control.fail(cloudErrorMessage(error)))
      .finally(() => { void refresh(); });
  };

  /* Pulsar un tab lo abre en su raíz, también si ya estaba activo. */
  const selectSection = (next: CloudSection) => {
    setSection(next);
    setPaths(p => ({ ...p, [next]: [] }));
  };
  const createFolder = (name: string) => {
    const where = trail[trail.length - 1].name;
    cloudApi.createFolder(section, currentRel, name)
      .then(() => info('Carpeta creada', `«${name}» en ${where}.`), fail('No se pudo crear la carpeta'))
      .finally(() => { void refresh(); });
  };
  /* ── Mover, cambiar nombre y eliminar: siempre sobre un elemento de la
     carpeta abierta, así su sección y su ruta son las actuales. ── */
  const [action, setAction] = useState<{ kind: 'move' | 'rename' | 'delete' | 'details'; entry: CloudEntry } | null>(null);
  /* Detalles: la ruta en el servidor sale de la configuración (en caché). */
  const pathsConfig = useCloudPathsConfig(connection, connected);
  const closeAction = () => setAction(null);
  const renameCurrent = (entry: CloudEntry, name: string) => {
    closeAction();
    cloudApi.rename(section, entry.id, name)
      .then(() => info('Nombre cambiado', `«${entry.name}» ahora se llama «${name}».`), fail('No se pudo cambiar el nombre'))
      .finally(() => { void refresh(); });
  };
  const deleteCurrent = (entry: CloudEntry) => {
    closeAction();
    const where = trail[trail.length - 1].name;
    cloudApi.remove(section, entry.id)
      .then(() => info(entry.kind === 'folder' ? 'Carpeta eliminada' : 'Archivo eliminado', `«${entry.name}» se eliminó de ${where}.`),
        fail('No se pudo eliminar'))
      .finally(() => { void refresh(); });
  };
  const moveCurrent = (entry: CloudEntry, to: { section: CloudSection; path: string[] }) => {
    closeAction();
    const dest = resolvePath(roots[to.section], to.path).at(-1)?.name ?? '';
    cloudApi.move(section, entry.id, to.section, to.path.at(-1) ?? '')
      .then(() => info(entry.kind === 'folder' ? 'Carpeta movida' : 'Archivo movido', `«${entry.name}» se movió a «${dest}».`),
        fail('No se pudo mover'))
      .finally(() => { void refresh(); });
  };

  const open = (folder: CloudFolder) => setPath(prev => [...prev, folder.id]);

  /* Fijadas por sección: solo las que siguen existiendo en la nube. */
  const { pinned, pin, unpin, retain } = useCloudPinned();
  const pinnedFolders = useMemo(() => Object.fromEntries(CLOUD_SECTIONS.map(({ id: sec }) => [sec, pinned[sec].flatMap(id => {
    const route = findFolderPath(roots[sec], id);
    return route ? [resolvePath(roots[sec], route)[route.length]] : [];
  })])) as Record<CloudSection, CloudFolder[]>, [roots, pinned]);
  /* Se podan solo con el árbol de verdad cargado: sin conexión todo parece vacío. */
  const homeLoaded = connected && Boolean(homeTree.data);
  const backupsLoaded = connected && Boolean(backupsTree.data);
  useEffect(() => {
    for (const { id: sec } of CLOUD_SECTIONS) {
      const loaded = sec === 'home' ? homeLoaded : backupsLoaded;
      if (loaded && pinnedFolders[sec].length < pinned[sec].length) retain(sec, pinnedFolders[sec].map(f => f.id));
    }
  }, [pinnedFolders, pinned, retain, homeLoaded, backupsLoaded]);
  const togglePin = (folder: CloudFolder) =>
    (pinned[section].includes(folder.id) ? unpin(section, folder.id) : pin(section, folder.id));
  const openPinned = (sec: CloudSection, id: string) => {
    const route = findFolderPath(roots[sec], id);
    if (!route) return;
    setSection(sec);
    setPaths(p => ({ ...p, [sec]: route }));
  };
  /* `depth` cuenta la raíz de la sección como 0. */
  const navigate = (depth: number) => setPath(prev => prev.slice(0, depth));

  return (
    /* Soltar fuera de la columna de contenido no hace nada: sin esto el
       webview abriría el archivo y dejaría la app. */
    <div className="h-full min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,4fr)] gap-5"
      onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
      <CloudSidebar
        account={{ username: connection?.username ?? 'Sin conectar' }}
        status={cloud.status}
        section={section}
        onSelect={selectSection}
        pinned={pinnedFolders}
        currentFolderId={trail[trail.length - 1].id}
        onOpenPinned={openPinned}
        onUnpin={unpin}
        onOpenSettings={() => setSettings({ tab: connected ? 'paths' : 'connection' })}
        storage={storage}
      />

      <CloudExplorer
        trail={trail}
        rootIcon={CLOUD_SECTIONS.find(s => s.id === section)?.icon ?? 'home'}
        filters={filters}
        view={view}
        onNavigate={navigate}
        onOpen={open}
        onFiltersChange={setFilters}
        onViewChange={setView}
        notices={notices}
        onDownload={download}
        onPreview={openFile}
        pinnedIds={pinnedFolders[section].map(f => f.id)}
        onTogglePin={togglePin}
        onCreateFolder={createFolder}
        onMove={entry => setAction({ kind: 'move', entry })}
        onRename={entry => setAction({ kind: 'rename', entry })}
        onDelete={entry => setAction({ kind: 'delete', entry })}
        onDetails={entry => setAction({ kind: 'details', entry })}
        onPickError={() => info('No se pudo cargar', 'El explorador de archivos no se abrió o no dejó leer lo elegido.')}
        onDropFiles={upload}
        onDismissNotice={dismiss}
      />

      {action?.kind === 'rename' && (
        <RenameEntryModal entry={action.entry} siblings={trail[trail.length - 1].children}
          onRename={name => renameCurrent(action.entry, name)} onClose={closeAction} />
      )}
      {action?.kind === 'delete' && (
        <DeleteEntryModal entry={action.entry} onDelete={() => deleteCurrent(action.entry)} onClose={closeAction} />
      )}
      {action?.kind === 'details' && (
        <EntryDetailsModal entry={action.entry} section={section} location={trail.slice(1).map(f => f.name)}
          serverRoot={pathsConfig.data?.paths[section]} pinned={pinned[section].includes(action.entry.id)} onClose={closeAction} />
      )}
      {action?.kind === 'move' && (
        <MoveEntryModal entry={action.entry} from={{ section, path }} roots={roots}
          onMove={to => moveCurrent(action.entry, to)} onClose={closeAction} />
      )}

      {(mustConnect || settings) && (
        <CloudSettingsModal initialTab={settings?.tab ?? 'connection'} required={mustConnect}
          onPathsSaved={savePaths} onClose={() => setSettings(null)} onLeave={() => navigateTo(ROUTES.DASHBOARD)} />
      )}

      <FileViewerModal file={preview?.file ?? null} getContent={contentOf}
        onDownload={file => downloadFrom(preview?.section ?? section, file)} onClose={() => setPreview(null)} />
    </div>
  );
};
