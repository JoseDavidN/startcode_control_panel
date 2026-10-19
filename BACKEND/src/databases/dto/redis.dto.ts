import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { RedisEditInput } from '../services/redis-explorer.service';

/* Las claves de Redis pueden ser largas; el cuerpo JSON de la API no pasa de 100 KB. */
const MAX_KEY = 4_096;
const MAX_VALUE = 90_000;

export const REDIS_KEY_TYPES = ['string', 'hash', 'list', 'set', 'zset', 'stream'] as const;
const EDIT_OPS: RedisEditInput['op'][] = [
  'create', 'set', 'hset', 'hdel', 'lset', 'lpush', 'rpush', 'lremIndex',
  'sadd', 'srem', 'zadd', 'zrem', 'xadd', 'xdel', 'expire', 'rename',
];

/** Base y sesión: lo común a todas las llamadas de Redis. */
export class RedisDbDto {
  @ApiProperty({ example: 0, description: 'Índice de la base (0–15)' })
  @IsInt()
  @Min(0)
  @Max(15)
  db: number;

  @ApiPropertyOptional({ description: 'Sesión de la vista de consultas; sin ella se abre una conexión para esta llamada' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

export class RedisScanDto extends RedisDbDto {
  @ApiPropertyOptional({ example: 'user:*', description: 'Patrón de SCAN MATCH (por defecto `*`)' })
  @IsOptional()
  @IsString()
  @MaxLength(1_024)
  pattern?: string;

  @ApiPropertyOptional({ example: '0', description: 'Cursor de la página anterior' })
  @IsOptional()
  @Matches(/^\d{1,20}$/, { message: 'Cursor no válido' })
  cursor?: string;

  @ApiPropertyOptional({ enum: REDIS_KEY_TYPES, description: 'Solo claves de este tipo (Redis 6 o superior)' })
  @IsOptional()
  @IsIn(REDIS_KEY_TYPES)
  type?: string;
}

export class RedisKeyDto extends RedisDbDto {
  @ApiProperty({ example: 'user:15' })
  @IsString()
  @IsNotEmpty({ message: 'La clave está vacía' })
  @MaxLength(MAX_KEY)
  key: string;
}

export class RedisEditDto extends RedisKeyDto {
  @ApiProperty({ enum: EDIT_OPS })
  @IsIn(EDIT_OPS)
  op: RedisEditInput['op'];

  @ApiPropertyOptional({ enum: REDIS_KEY_TYPES, description: 'En `create`' })
  @IsOptional()
  @IsIn(REDIS_KEY_TYPES)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_VALUE)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_KEY)
  field?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_VALUE)
  member?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  score?: number;

  @ApiPropertyOptional({ description: 'Posición en la lista (negativa cuenta desde el final)' })
  @IsOptional()
  @IsInt()
  index?: number;

  @ApiPropertyOptional({ description: 'Campos de una entrada de stream', example: { evento: 'login' } })
  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Segundos hasta caducar; null quita la caducidad' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  ttl?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_KEY)
  newKey?: string;

  @ApiPropertyOptional({ example: '1700000000000-0' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+-\d+$/, { message: 'Id de entrada no válido' })
  id?: string;
}

export class RedisDeleteKeysDto extends RedisDbDto {
  @ApiProperty({ example: ['user:15'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1_000)
  @IsString({ each: true })
  @MaxLength(MAX_KEY, { each: true })
  keys: string[];
}

export class RedisCommandDto extends RedisDbDto {
  @ApiProperty({ example: 'HGETALL user:15' })
  @IsString()
  @IsNotEmpty({ message: 'El comando está vacío' })
  @MaxLength(MAX_VALUE)
  command: string;

  @ApiPropertyOptional({ description: 'El usuario confirmó un comando peligroso (sin esto responde 400 `DANGEROUS_QUERY`)' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
