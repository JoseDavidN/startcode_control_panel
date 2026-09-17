// src/monitoring/dto/agent-message.dto.ts
import { IsString, IsNumber, IsObject, IsEnum, IsNotEmpty } from 'class-validator';

/**
 * Tipos de mensajes que el agente puede enviar
 */
export enum AgentMessageType {
  HEARTBEAT = 'heartbeat',
  SYSTEM_INFO = 'system_info',
  METRICS = 'metrics',
  SERVICES_INVENTORY = 'services_inventory',
  PROCESSES_INVENTORY = 'processes_inventory',
  WEBSITES_INVENTORY = 'websites_inventory',
  DATABASES_INVENTORY = 'databases_inventory',
}

/**
 * Sobre común de todos los mensajes del agente.
 *
 * El `data` no se describe aquí: cada tipo tiene su forma y se valida con las
 * guardas de `agent-payload.ts`, que toleran campos nuevos (el contrato con el
 * agente es aditivo) y devuelven la ruta exacta del campo que falla.
 */
export class AgentMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  agentVersion: string;

  @IsNumber()
  timestamp: number;

  @IsString()
  @IsNotEmpty()
  serverId: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEnum(AgentMessageType)
  type: AgentMessageType;

  @IsObject()
  data: unknown;
}
