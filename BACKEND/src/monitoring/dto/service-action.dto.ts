import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ServiceAction {
  START = 'start',
  STOP = 'stop',
  RESTART = 'restart',
}

export class ServiceActionDto {
  @ApiProperty({ enum: ServiceAction, description: 'Acción a ejecutar en el servicio' })
  @IsEnum(ServiceAction)
  action: ServiceAction;
}
