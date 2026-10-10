import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus,
  InternalServerErrorException, NotFoundException,
} from '@nestjs/common';

/** Error con el formato que entiende el panel: `{ code, message, hint }`. */
export const cloudError = (Kind: new (body: object) => HttpException, code: string, message: string, hint?: string) =>
  new Kind({ code, message, ...(hint ? { hint } : {}) });

/** Traduce un error del sistema de archivos a una respuesta en español. */
export function translateFsError(error: unknown, what = 'el elemento'): HttpException {
  if (error instanceof HttpException) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  switch (code) {
    case 'ENOENT':
      return cloudError(NotFoundException, 'NOT_FOUND', `No existe ${what}.`, 'Puede que se haya movido o eliminado: actualiza la vista.');
    case 'EEXIST':
    case 'ENOTEMPTY':
      return cloudError(ConflictException, 'ALREADY_EXISTS', `Ya existe ${what} con ese nombre.`);
    case 'EACCES':
    case 'EPERM':
      return cloudError(ForbiddenException, 'NO_PERMISSION', 'El servidor de la nube no tiene permiso sobre esa carpeta.', 'Revisa el propietario y los permisos de la carpeta en el servidor.');
    case 'ENOSPC':
      return new HttpException({ code: 'NO_SPACE', message: 'No queda espacio en el disco de la nube.' }, HttpStatus.INSUFFICIENT_STORAGE);
    case 'ENOTDIR':
      return cloudError(BadRequestException, 'NOT_A_FOLDER', 'La ruta no es una carpeta.');
    case 'EISDIR':
      return cloudError(BadRequestException, 'IS_A_FOLDER', 'La ruta es una carpeta, no un archivo.');
    case 'ENAMETOOLONG':
      return cloudError(BadRequestException, 'NAME_TOO_LONG', 'La ruta es demasiado larga.');
    default:
      return new InternalServerErrorException({ code: 'FS_ERROR', message: 'Error inesperado del sistema de archivos de la nube.' });
  }
}
