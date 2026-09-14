import { Controller, Post, Patch, Body, Get, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, TwoFactorPendingDto } from './dto/auth-response.dto';
import { TwoFactorCodeDto, TwoFactorVerifyLoginDto, TwoFactorSetupResponseDto } from './dto/two-factor.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'El email ya esta registrado' })
  @ApiBody({ type: RegisterDto, description: 'Datos del usuario a registrar' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Tokens de acceso', type: AuthResponseDto })
  @ApiResponse({ status: 200, description: 'Requiere 2FA', type: TwoFactorPendingDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto | TwoFactorPendingDto> {
    return this.authService.login(loginDto);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Iniciar configuración de 2FA — genera secreto y QR' })
  @ApiResponse({ status: 201, type: TwoFactorSetupResponseDto })
  async setup2FA(@Request() req): Promise<TwoFactorSetupResponseDto> {
    return this.authService.setup2FA(req.user.id);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar 2FA — confirmar con código de la app' })
  @ApiResponse({ status: 200, description: '2FA activado' })
  @ApiResponse({ status: 400, description: 'Setup no iniciado o ya activado' })
  @ApiResponse({ status: 401, description: 'Código inválido' })
  @ApiBody({ type: TwoFactorCodeDto })
  async enable2FA(@Request() req, @Body() dto: TwoFactorCodeDto) {
    return this.authService.enable2FA(req.user.id, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar 2FA — confirmar con código de la app' })
  @ApiResponse({ status: 200, description: '2FA desactivado' })
  @ApiResponse({ status: 400, description: '2FA no está activado' })
  @ApiResponse({ status: 401, description: 'Código inválido' })
  @ApiBody({ type: TwoFactorCodeDto })
  async disable2FA(@Request() req, @Body() dto: TwoFactorCodeDto) {
    return this.authService.disable2FA(req.user.id, dto.code);
  }

  @Post('2fa/verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Completar login con código 2FA' })
  @ApiResponse({ status: 200, description: 'Tokens de acceso', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Token temporal o código 2FA inválidos' })
  @ApiBody({ type: TwoFactorVerifyLoginDto })
  async verify2FALogin(@Body() dto: TwoFactorVerifyLoginDto): Promise<AuthResponseDto> {
    return this.authService.verifyLogin2FA(dto.tempToken, dto.code);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario actual' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar perfil del usuario actual' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  @ApiResponse({ status: 409, description: 'Email ya en uso' })
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña del usuario actual' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 401, description: 'Contraseña actual incorrecta' })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener información del usuario actual' })
  @ApiResponse({ status: 200, description: 'Información del usuario' })
  async getMe(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Preferencias del usuario actual' })
  @ApiResponse({ status: 200, description: 'Preferencias completas' })
  async getPreferences(@Request() req) {
    return this.authService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar preferencias — merge por sección' })
  @ApiResponse({ status: 200, description: 'Preferencias actualizadas' })
  @ApiBody({ type: UpdatePreferencesDto })
  async updatePreferences(@Request() req, @Body() dto: UpdatePreferencesDto) {
    return this.authService.updatePreferences(req.user.id, dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiResponse({ status: 200, description: 'Token renovado exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de actualización inválido o expirado' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' },
      },
      required: ['refreshToken'],
    },
  })
  async refresh(@Body('refreshToken') refreshToken: string): Promise<AuthResponseDto> {
    return this.authService.refreshToken(refreshToken);
  }
}
