import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RawValue } from '@auth/dto/raw-value.decorator';

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt solo usa los primeros 72 bytes: más allá, el resto no cuenta. */
export const PASSWORD_MAX_LENGTH = 72;
/** Tope para las contraseñas que solo se comparan (login, contraseña actual). */
export const PASSWORD_INPUT_MAX_LENGTH = 128;

/** Minúscula, mayúscula, número y un símbolo (cualquier carácter que no sea letra ni número). */
export const STRONG_PASSWORD = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\p{Nd})(?=.*[^\p{L}\p{Nd}]).+$/u;

/** Política para fijar una contraseña nueva (registro y cambio de contraseña). */
export const IsStrongPassword = (): PropertyDecorator =>
  applyDecorators(
    RawValue(),
    IsString({ message: 'La contraseña debe ser texto' }),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `La contraseña debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres`,
    }),
    Matches(STRONG_PASSWORD, {
      message:
        'La contraseña debe tener al menos una letra mayúscula, una minúscula, un número y un carácter especial',
    }),
  );
