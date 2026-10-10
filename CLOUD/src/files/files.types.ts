import type { CloudFileType } from './file-types';

/* Mismo contrato que `FRONTEND/src/types/cloud.types.ts`. Los `id` son la
   ruta relativa a la raíz de la sección (`Documentos/Contratos`); la raíz
   es la cadena vacía. */
export interface CloudFolderDto {
  kind: 'folder';
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  children: CloudEntryDto[];
}

export interface CloudFileDto {
  kind: 'file';
  id: string;
  name: string;
  type: CloudFileType;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export type CloudEntryDto = CloudFolderDto | CloudFileDto;
