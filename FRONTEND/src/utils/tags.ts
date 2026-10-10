/* Etiquetas de servidores y conexiones a bases de datos. Mismo enum que
   `ServerTag` y `DatabaseTag` del backend. Lista cerrada: se elige una, no se
   escriben etiquetas propias. */

export type ResourceTag = 'production' | 'staging' | 'testing' | 'development' | 'backup';

export const TAG_OPTIONS: { value: ResourceTag; label: string }[] = [
  { value: 'production',  label: 'Producción' },
  { value: 'staging',     label: 'Preproducción' },
  { value: 'testing',     label: 'Pruebas' },
  { value: 'development', label: 'Desarrollo' },
  { value: 'backup',      label: 'Respaldo' },
];

/** Para los formularios: '' es «sin etiqueta» y al backend llega como null. */
export const TAG_FIELD_OPTIONS: { value: ResourceTag | ''; label: string }[] = [
  { value: '', label: 'Sin etiqueta' },
  ...TAG_OPTIONS,
];

export const tagLabel = (tag: ResourceTag): string => TAG_OPTIONS.find(t => t.value === tag)?.label ?? tag;

/* Píldora redondeada y sin mayúsculas: no se confunde con el badge de estado. */
export const TAG_TONES: Record<ResourceTag, string> = {
  production:  'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/20',
  staging:     'bg-orange-500/15 text-orange-300 ring-orange-400/20',
  testing:     'bg-sky-500/15 text-sky-300 ring-sky-400/20',
  development: 'bg-teal-500/15 text-teal-300 ring-teal-400/20',
  backup:      'bg-tint-active text-white/60 ring-hairline',
};
