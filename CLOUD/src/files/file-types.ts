/* Tipo de archivo por extensión: el mismo reparto que usa el panel
   (`FRONTEND/src/utils/cloud.ts`, fileTypeFromName) para iconos y filtros. */
export type CloudFileType =
  | 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image'
  | 'video' | 'audio' | 'archive' | 'code' | 'text';

const EXTENSIONS: [CloudFileType, string[]][] = [
  ['word', ['doc', 'docx', 'odt', 'rtf']],
  ['excel', ['xls', 'xlsx', 'xlsm', 'csv', 'ods']],
  ['powerpoint', ['ppt', 'pptx', 'odp', 'key']],
  ['pdf', ['pdf']],
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'heic', 'avif']],
  ['video', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']],
  ['audio', ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz']],
  ['code', ['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'java', 'go', 'rs', 'php', 'rb', 'sh', 'yml', 'yaml', 'xml', 'sql', 'c', 'cpp', 'h', 'cs', 'kt', 'swift', 'vue', 'env', 'toml', 'ini']],
];
const TYPE_BY_EXT = new Map(EXTENSIONS.flatMap(([type, exts]) => exts.map(ext => [ext, type] as const)));

export function fileTypeFromName(name: string): CloudFileType {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return TYPE_BY_EXT.get(ext) ?? 'text';
}

const MIME: Partial<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
  zip: 'application/zip', json: 'application/json', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

/* Nunca text/html ni similares: el contenido se entrega para descargar o
   leer como datos, no para que un navegador lo interprete. */
export function mimeFromName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}
