import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { FontFamily, ServersView, SidebarMode, Theme } from '../types/user-preferences.type';

export class AppearancePrefsDto {
  @ApiPropertyOptional({ enum: ['dark', 'aurora', 'solar'] })
  @IsOptional()
  @IsIn(['dark', 'aurora', 'solar'])
  theme?: Theme;

  @ApiPropertyOptional({ enum: ['grotesk', 'mono', 'rounded'] })
  @IsOptional()
  @IsIn(['grotesk', 'mono', 'rounded'])
  font?: FontFamily;

  @ApiPropertyOptional({ enum: ['expanded', 'collapsed'] })
  @IsOptional()
  @IsIn(['expanded', 'collapsed'])
  sidebarMode?: SidebarMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @ApiPropertyOptional({ enum: ['cards', 'list'] })
  @IsOptional()
  @IsIn(['cards', 'list'])
  serversView?: ServersView;
}

export class NotificationPrefsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() serverOffline?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() highCpuUsage?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() highMemoryUsage?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() highDiskUsage?: boolean;
  /* Obsoleto: la notificación del sistema se configura en cada equipo. Se
     acepta para no romper versiones anteriores de la app, pero no se guarda
     (`mergePreferences` solo conserva las claves conocidas). */
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsBoolean() securityAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() weeklyReport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() productNews?: boolean;
}

export class SecurityPrefsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1440, description: 'Minutos; 0 = nunca' })
  @IsOptional() @IsInt() @Min(0) @Max(1440)
  sessionTimeout?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 365, description: 'Días; 0 = nunca' })
  @IsOptional() @IsInt() @Min(0) @Max(365)
  passwordExpiration?: number;
}

export class MonitoringPrefsDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 3600, description: 'Segundos' })
  @IsOptional() @IsInt() @Min(5) @Max(3600)
  refreshInterval?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  cpuThreshold?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  memoryThreshold?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  diskThreshold?: number;
}

/**
 * PATCH parcial: cada sección es opcional y se fusiona con la guardada.
 * `@Type()` es obligatorio — sin él, `whitelist` vacía el objeto anidado en silencio.
 */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ type: AppearancePrefsDto })
  @IsOptional() @ValidateNested() @Type(() => AppearancePrefsDto)
  appearance?: AppearancePrefsDto;

  @ApiPropertyOptional({ type: NotificationPrefsDto })
  @IsOptional() @ValidateNested() @Type(() => NotificationPrefsDto)
  notifications?: NotificationPrefsDto;

  @ApiPropertyOptional({ type: SecurityPrefsDto })
  @IsOptional() @ValidateNested() @Type(() => SecurityPrefsDto)
  security?: SecurityPrefsDto;

  @ApiPropertyOptional({ type: MonitoringPrefsDto })
  @IsOptional() @ValidateNested() @Type(() => MonitoringPrefsDto)
  monitoring?: MonitoringPrefsDto;
}
