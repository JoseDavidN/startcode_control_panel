import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateDatabaseConnectionDto } from './create-database-connection.dto';

/** Prueba datos sin guardar (formulario de nueva conexión o de edición). */
export class TestDatabaseConnectionDto extends OmitType(CreateDatabaseConnectionDto, ['name'] as const) {
  @ApiPropertyOptional({
    description:
      'Conexión que se está editando: si `password` se omite, se prueba con la contraseña guardada.',
  })
  @IsOptional()
  @IsUUID()
  connectionId?: string;
}
