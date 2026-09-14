import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, TwoFactorPendingDto, UserProfileDto } from './dto/auth-response.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { mergePreferences } from './types/user-preferences.type';
import type { UserPreferences } from './types/user-preferences.type';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  // Factor de costo para bcrypt (12 es el recomendado por OWASP)
  // Cada incremento duplica el tiempo de cómputo: 10=~100ms, 12=~400ms, 14=~1.6s
  private readonly BCRYPT_SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { firstname, lastname, email, password } = registerDto;

    // Verificar si el email ya existe
    const existingUser = await this.usersRepository.findOne({
      where: { email: email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya esta registrado');
    }

    // Hash de la contraseña con factor de costo alto (más seguro)
    const hashedPassword = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    // Crear usuario
    const user = this.usersRepository.create({
      firstname: firstname,
      lastname: lastname,
      email: email,
      password: hashedPassword,
    });

    await this.usersRepository.save(user);

    return this.buildAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto | TwoFactorPendingDto> {
    const { email, password } = loginDto;

    const user = await this.usersRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'firstname',
        'lastname',
        'password',
        'role',
        'isActive',
        'twoFactorEnabled',
        'lastLogin',
        'passwordChangedAt',
        'preferences',
        'createdAt',
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.usersRepository.update(user.id, { lastLogin: new Date() });

    if (user.twoFactorEnabled) {
      return {
        requiresTwoFactor: true,
        tempToken: this.generateTempToken(user),
      };
    }

    return this.buildAuthResponse(user);
  }

  async verifyLogin2FA(tempToken: string, code: string): Promise<AuthResponseDto> {
    let payload: { sub: string; type: string };

    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token temporal inválido o expirado');
    }

    if (payload.type !== '2fa-pending') {
      throw new UnauthorizedException('Token temporal inválido');
    }

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'firstname', 'lastname', 'role', 'isActive', 'twoFactorEnabled',
        'twoFactorSecret', 'lastLogin', 'passwordChangedAt', 'preferences', 'createdAt'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (!user.twoFactorSecret || !speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code })) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    return this.buildAuthResponse(user);
  }

  async setup2FA(userId: string): Promise<TwoFactorSetupResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'twoFactorEnabled'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('El 2FA ya está activado para esta cuenta');
    }

    const appName = this.configService.get('APP_NAME', 'StartCode Panel');
    const generated = speakeasy.generateSecret({
      name: `${appName}:${user.email}`,
    });
    const secret = generated.base32;
    const otpAuthUrl = generated.otpauth_url!;
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    await this.usersRepository.update(userId, { twoFactorSecret: secret });

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  async enable2FA(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorEnabled', 'twoFactorSecret'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('El 2FA ya está activado');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Primero ejecuta el setup de 2FA');
    }

    if (!speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code })) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.usersRepository.update(userId, { twoFactorEnabled: true });

    return { message: '2FA activado correctamente' };
  }

  async disable2FA(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorEnabled', 'twoFactorSecret'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('El 2FA no está activado');
    }

    if (!user.twoFactorSecret || !speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code })) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.usersRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    return { message: '2FA desactivado correctamente' };
  }

  private generateTempToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, type: '2fa-pending' },
      { expiresIn: '5m' },
    );
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);
    const expiresIn = this.configService.get('JWT_EXPIRES_IN', '30m');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstname} ${user.lastname}`,
        role: user.role,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLogin: user.lastLogin,
        passwordChangedAt: user.passwordChangedAt,
        createdAt: user.createdAt,
        preferences: user.preferences ?? null,
      },
      token,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Perfil del usuario actual. Se mapea campo a campo a propósito: la entidad cruda
   * expondría el hash de la contraseña y el secreto TOTP (los @Exclude() no se aplican
   * porque no hay ClassSerializerInterceptor registrado).
   */
  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return {
      id: user.id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      name: `${user.firstname} ${user.lastname}`,
      role: user.role,
      isActive: user.isActive,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLogin: user.lastLogin,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      // null ⇒ el usuario nunca guardó preferencias; el cliente hará el primer push
      preferences: user.preferences ?? null,
    };
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'preferences'],
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    return mergePreferences(user.preferences, {});
  }

  /** Merge por sección: un PATCH parcial no pisa las secciones que no vienen en el body. */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreferences> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'preferences'],
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const merged = mergePreferences(user.preferences, dto as Partial<UserPreferences>);
    await this.usersRepository.update(userId, { preferences: merged });

    return merged;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<{ message: string; user: Partial<User> }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
      if (existing) throw new ConflictException('El email ya está en uso');
    }

    const changes: Partial<User> = {};
    if (dto.firstname !== undefined) changes.firstname = dto.firstname;
    if (dto.lastname !== undefined) changes.lastname = dto.lastname;
    if (dto.email !== undefined) changes.email = dto.email;

    await this.usersRepository.update(userId, changes);

    const updated = await this.usersRepository.findOne({ where: { id: userId } });

    return {
      message: 'Perfil actualizado correctamente',
      user: {
        id: updated!.id,
        firstname: updated!.firstname,
        lastname: updated!.lastname,
        email: updated!.email,
        role: updated!.role,
        isActive: updated!.isActive,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('Contraseña actual incorrecta');

    const hashed = await bcrypt.hash(dto.newPassword, this.BCRYPT_SALT_ROUNDS);
    await this.usersRepository.update(userId, { password: hashed, passwordChangedAt: new Date() });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return user;
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      // Verificar el refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_SECRET'),
      });

      // Buscar el usuario
      const user = await this.usersRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Usuario no autorizado');
      }

      return this.buildAuthResponse(user);
    } catch (error) {
      throw new UnauthorizedException('Token de actualización inválido o expirado');
    }
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  generateAgentToken(serverId: string, serverName: string): string {
    const payload = {
      sub: serverId,
      type: 'agent',
      serverName,
    };
    const expiresIn = this.configService.get('AGENT_TOKEN_EXPIRES_IN', '365d');
    return this.jwtService.sign(payload, { expiresIn });
  }

  private generateRefreshToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
    };

    const expiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d');

    return this.jwtService.sign(payload, {
      expiresIn,
    });
  }
}
