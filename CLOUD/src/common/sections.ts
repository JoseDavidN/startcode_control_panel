/** Secciones de la nube; cada una es una carpeta raíz en el disco. */
export const SECTIONS = ['home', 'backups'] as const;
export type Section = (typeof SECTIONS)[number];

export type SectionPaths = Record<Section, string>;
