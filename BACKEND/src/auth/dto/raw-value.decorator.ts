import { Transform } from 'class-transformer';

/**
 * Devuelve el valor tal como llegó en el cuerpo, antes de la conversión
 * implícita del ValidationPipe global (`enableImplicitConversion`).
 *
 * Sin esto, un objeto o un número en un campo `string` se convierte en
 * `"[object Object]"` o `"123"` y pasa `@IsString()`: la confusión de tipos
 * queda tapada en lugar de rechazarse con 400.
 */
export const RawValue = (): PropertyDecorator =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]);
