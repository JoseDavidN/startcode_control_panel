/** Cuenta de StartCode Cloud del usuario. */
export interface CloudAccount {
  /** Nombre de usuario en la nube (lo único que se muestra). */
  username: string;
}

/** Espacio de la cuenta en la nube, en bytes. */
export interface CloudStorage {
  used: number;
  total: number;
}

export type CloudConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/** Secciones de la columna de navegación de la nube. */
export type CloudSection = 'home' | 'backups';

export type CloudFileType =
  | 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image'
  | 'video' | 'audio' | 'archive' | 'code' | 'text';

export interface CloudFolder {
  kind: 'folder';
  id: string;
  name: string;
  /** Fechas ISO. */
  createdAt: string;
  modifiedAt: string;
  children: CloudEntry[];
}

export interface CloudFile {
  kind: 'file';
  id: string;
  name: string;
  type: CloudFileType;
  /** Bytes. */
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export type CloudEntry = CloudFolder | CloudFile;

export type CloudView = 'grid' | 'list';

/** Separación de la vista de lista: las carpetas o un tipo de archivo. */
export type CloudGroup = 'folder' | CloudFileType;

/** Filtro de tipo: carpetas, un tipo de archivo o todo. */
export type CloudTypeFilter = 'all' | 'folder' | CloudFileType;

/** Fecha de creación, por periodo del calendario. */
export type CloudDateFilter = 'any' | 'today' | 'week' | 'month' | 'year';

/** Tiempo transcurrido desde la última modificación. */
export type CloudModifiedFilter = 'any' | '1h' | '24h' | '7d' | '30d' | 'older';

export interface CloudFilters {
  /** Texto del buscador: parte del nombre, sin distinguir mayúsculas ni tildes. */
  query: string;
  type: CloudTypeFilter;
  date: CloudDateFilter;
  modified: CloudModifiedFilter;
}

/** Aviso dentro de la vista Cloud (abajo, en la columna de contenido). */
export type CloudNotice =
  | { id: string; kind: 'info'; title: string; description?: string }
  | {
      id: string;
      kind: 'upload';
      /** Lo que se cargó: nombre de la carpeta o archivo, o «N elementos». */
      label: string;
      /** Carpeta de destino. */
      destination: string;
      fileCount: number;
      bytes: number;
      /** 0 a 1. */
      progress: number;
      status: 'uploading' | 'done';
    };

/** Dónde vive cada sección en el almacenamiento de la nube (rutas absolutas). */
export type CloudPaths = Record<CloudSection, string>;

/** Rutas guardadas en la nube y las carpetas dentro de las que pueden ir. */
export interface CloudPathsConfig {
  paths: CloudPaths;
  allowedRoots: string[];
}

/** Conexión del panel con un backend de StartCode Cloud, guardada en el equipo. */
export interface CloudConnection {
  /** Origen del backend, sin `/api/v1` (p. ej. `http://servidor:3100`). */
  url: string;
  token: string;
  username: string;
}

export interface CloudConnectionState {
  status: CloudConnectionStatus;
  connection: CloudConnection | null;
  /** Versión del backend de la nube, cuando está conectada. */
  version: string | null;
  /** Por qué no está conectada teniendo una conexión guardada (servidor caído, sesión cerrada…). */
  error: string | null;
}
