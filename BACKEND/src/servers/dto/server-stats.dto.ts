import { ApiProperty } from '@nestjs/swagger';

export class ServerStatsDto {
  @ApiProperty({ description: 'Total de servidores', example: 10 })
  total: number;

  @ApiProperty({ description: 'Servidores online', example: 7 })
  online: number; 

  @ApiProperty({ description: 'Servidores offline', example: 2 })
  offline: number;

  @ApiProperty({ description: 'Servidores con error', example: 1 })
  error: number;

  @ApiProperty({ description: 'Servidores en mantenimiento', example: 0 })
  maintenance: number;

  @ApiProperty({ description: 'Servidores verificando estado', example: 0 })
  checking: number;

  @ApiProperty({ description: 'Servidores en atención', example: 0 })
  warning: number;

  @ApiProperty({ description: 'Servidores creados a la espera del agente', example: 1 })
  pending: number;
}
