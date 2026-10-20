import { BadRequestException } from '@nestjs/common';

/**
 * Comillas de shell para todo lo que se manda por SSH.
 *
 * Un único helper, probado en `shell.spec.ts`: cualquier valor que acabe en
 * un comando remoto (nombre de unidad, ruta, usuario…) pasa por aquí después
 * de validarse con su lista de caracteres permitidos. Nunca se concatena a
 * mano. Sirve para sh, dash, bash y el ash de BusyBox: dentro de comillas
 * simples no se interpreta nada, y el apóstrofo se cierra, se escapa y se
 * vuelve a abrir (`'\''`).
 */
export function shellQuote(value: string): string {
  if (typeof value !== 'string') throw new BadRequestException('Valor no válido para el comando');
  /* Un byte nulo corta el argumento en el lado remoto: lo que se validó ya no es lo que se ejecuta. */
  if (value.includes('\0')) throw new BadRequestException('El valor contiene un byte nulo');
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Unidades de systemd: letras, dígitos y `:_.@-\`, como las admite
 * `systemd-escape`. Sin guion inicial, para que nunca se lean como una opción
 * (`--root=…`, `-H host`), y con el tope de nombre de systemd (256).
 */
const UNIT_NAME = /^[A-Za-z0-9_@:\\][A-Za-z0-9_.@:\\-]{0,255}$/;

export function isValidUnitName(name: unknown): name is string {
  return typeof name === 'string' && UNIT_NAME.test(name) && !name.includes('..');
}

export function assertUnitName(name: unknown): string {
  if (!isValidUnitName(name)) throw new BadRequestException('Nombre de servicio inválido');
  return name;
}
