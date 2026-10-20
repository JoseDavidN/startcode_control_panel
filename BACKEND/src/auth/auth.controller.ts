import {
  Controller,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { ClientContext } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from '@auth/dto/refresh-token.dto';
import {
  AuthResponseDto,
  PasswordChangeRequiredDto,
  TwoFactorPendingDto,
} from './dto/auth-response.dto';
import {
  TwoFactorCodeDto,
  TwoFactorCodeWithPasswordDto,
  TwoFactorEnabledResponseDto,
  TwoFactorVerifyLoginDto,
  TwoFactorSetupResponseDto,
} from './dto/two-factor.dto';
import { UpdateProfileDto, ChangePasswordDto, ChangeExpiredPasswordDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import type { AuthenticatedRequest } from '@auth/types/authenticated-request.type';

/**
 * IP del dispositivo que hace la petición. Detrás de un proxy manda la
 * primera de `X-Forwarded-For` (o `X-Real-IP`); si no, la del socket. Node
 * entrega las IPv4 como IPv6 mapeadas (`::ffff:100.64.0.7`) y la local como
 * `::1`: se guardan como la IPv4 que son.
 */
function clientIp(req: { headers?: Record<string, unknown>; ip?: string }): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  const realIp = req.headers?.['x-real-ip'];
  const raw =
    (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim()) ||
    (typeof realIp === 'string' && realIp.trim()) ||
    req.ip ||
    null;
  if (!raw) return null;
  if (raw === '::1') return '127.0.0.1';
  return raw.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, '$1');
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Dispositivo que hace la petición: alimenta la lista de sesiones activas. */
  private clientOf(req: { headers?: Record<string, unknown>; ip?: string }): ClientContext {
    const userAgent = (req.headers?.['user-agent'] as string) ?? null;
    /* La app de escritorio manda `X-StartCode-Client: desktop/<versión>`: su
       webview no se distingue de un navegador por el user-agent. */
    const header = req.headers?.['x-startcode-client'];
    const app = typeof header === 'string' ? /^desktop\/([\w.+-]{1,32})$/.exec(header) : null;
    /* Nombre del equipo (`X-StartCode-Device`, codificado para admitir tildes): solo para el aviso de inicio de sesión. */
    const rawDevice = req.headers?.['x-startcode-device'];
    let device: string | null = null;
    if (typeof rawDevice === 'string') {
      try { device = decodeURIComponent(rawDevice); } catch { device = null; }
      /* Sin caracteres de control (códigos < 32 y 127). */
      device = device ? [...device].filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').trim().slice(0, 64) || null : null;
    }
    return {
      userAgent: app ? `${userAgent ?? ''} StartCodePanel/${app[1]}`.trim() : userAgent,
      ip: clientIp(req),
      device,
      /* `req.ip` respeta `trust proxy` (TRUST_PROXY): no se puede falsear con cabeceras. */
      remoteIp: req.ip ?? null,
    };
  }

  @Post('register')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'El email ya esta registrado' })
  @ApiBody({ type: RegisterDto, description: 'Datos del usuario a registrar' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Tokens de acceso', type: AuthResponseDto })
  @ApiResponse({ status: 200, description: 'Requiere 2FA', type: TwoFactorPendingDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.OK)
  async login(
    @Request() req: ExpressRequest,
    @Body() loginDto: LoginDto,
  ): Promise<AuthResponseDto | TwoFactorPendingDto | PasswordChangeRequiredDto> {
    return this.authService.login(loginDto, this.clientOf(req));
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Iniciar configuración de 2FA — genera secreto y QR' })
  @ApiResponse({ status: 201, type: TwoFactorSetupResponseDto })
  async setup2FA(@Request() req: AuthenticatedRequest): Promise<TwoFactorSetupResponseDto> {
    return this.authService.setup2FA(req.user.id);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar 2FA — confirmar con código de la app' })
  @ApiResponse({ status: 200, description: '2FA activado', type: TwoFactorEnabledResponseDto })
  @ApiResponse({ status: 400, description: 'Setup no iniciado o ya activado' })
  @ApiResponse({ status: 401, description: 'Código inválido' })
  @ApiBody({ type: TwoFactorCodeDto })
  async enable2FA(@Request() req: AuthenticatedRequest, @Body() dto: TwoFactorCodeDto): Promise<TwoFactorEnabledResponseDto> {
    return this.authService.enable2FA(req.user.id, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar 2FA — exige contraseña y código' })
  @ApiResponse({ status: 200, description: '2FA desactivado' })
  @ApiResponse({ status: 400, description: '2FA no está activado' })
  @ApiResponse({ status: 401, description: 'Contraseña o código inválidos' })
  @ApiBody({ type: TwoFactorCodeWithPasswordDto })
  async disable2FA(@Request() req: AuthenticatedRequest, @Body() dto: TwoFactorCodeWithPasswordDto) {
    return this.authService.disable2FA(req.user.id, dto.code, dto.password);
  }

  @Post('2fa/backup-codes/regenerate')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerar los códigos de respaldo — exige contraseña y código' })
  @ApiResponse({ status: 200, description: 'Nuevos códigos de respaldo' })
  @ApiBody({ type: TwoFactorCodeWithPasswordDto })
  async regenerateBackupCodes(@Request() req: AuthenticatedRequest, @Body() dto: TwoFactorCodeWithPasswordDto) {
    return this.authService.regenerateBackupCodes(req.user.id, dto.code, dto.password);
  }

  @Post('2fa/verify-login')
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Completar login con código 2FA' })
  @ApiResponse({ status: 200, description: 'Tokens de acceso', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Token temporal o código 2FA inválidos' })
  @ApiBody({ type: TwoFactorVerifyLoginDto })
  async verify2FALogin(
    @Request() req: ExpressRequest,
    @Body() dto: TwoFactorVerifyLoginDto,
  ): Promise<AuthResponseDto | PasswordChangeRequiredDto> {
    return this.authService.verifyLogin2FA(
      dto.tempToken,
      dto.code,
      dto.backupCode,
      this.clientOf(req),
    );
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario actual' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar perfil del usuario actual' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  @ApiResponse({ status: 409, description: 'Email ya en uso' })
  async updateProfile(@Request() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña del usuario actual' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 401, description: 'Contraseña actual incorrecta' })
  async changePassword(@Request() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto, req.user.sessionId);
  }

  @Post('change-expired-password')
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar la contraseña caducada',
    description:
      'Sin sesión: usa el token temporal que devuelve el login cuando la contraseña superó los días configurados. Al terminar emite la sesión.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiBody({ type: ChangeExpiredPasswordDto })
  async changeExpiredPassword(
    @Request() req: ExpressRequest,
    @Body() dto: ChangeExpiredPasswordDto,
  ): Promise<AuthResponseDto> {
    return this.authService.changeExpiredPassword(dto.tempToken, dto, this.clientOf(req));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar la sesión actual — revoca sus tokens' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logout(@Request() req: AuthenticatedRequest): Promise<{ message: string }> {
    if (req.user.sessionId) {
      await this.authService.revokeSession(req.user.id, req.user.sessionId, 'logout');
    }
    return { message: 'Sesión cerrada' };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sesiones activas del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones' })
  async listSessions(@Request() req: AuthenticatedRequest) {
    return this.authService.listSessions(req.user.id, req.user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revocar una sesión concreta' })
  @ApiParam({ name: 'id', description: 'Id de la sesión' })
  async revokeSession(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.authService.revokeSession(req.user.id, id);
    return { revoked: true };
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cerrar las demás sesiones, conservando la actual' })
  async revokeOtherSessions(@Request() req: AuthenticatedRequest) {
    const revoked = await this.authService.revokeOtherSessions(req.user.id, req.user.sessionId);
    return { revoked };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener información del usuario actual' })
  @ApiResponse({ status: 200, description: 'Información del usuario' })
  async getMe(@Request() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Preferencias del usuario actual' })
  @ApiResponse({ status: 200, description: 'Preferencias completas' })
  async getPreferences(@Request() req: AuthenticatedRequest) {
    return this.authService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar preferencias — merge por sección' })
  @ApiResponse({ status: 200, description: 'Preferencias actualizadas' })
  @ApiBody({ type: UpdatePreferencesDto })
  async updatePreferences(@Request() req: AuthenticatedRequest, @Body() dto: UpdatePreferencesDto) {
    return this.authService.updatePreferences(req.user.id, dto);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiResponse({ status: 200, description: 'Token renovado exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de actualización inválido o expirado' })
  @ApiBody({ type: RefreshTokenDto })
  async refresh(
    @Request() req: ExpressRequest,
    @Body() dto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto.refreshToken, this.clientOf(req));
  }
}
