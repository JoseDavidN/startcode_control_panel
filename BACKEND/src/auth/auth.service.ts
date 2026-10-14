import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponseDto,
  PasswordChangeRequiredDto,
  TwoFactorPendingDto,
  UserProfileDto,
} from './dto/auth-response.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { mergePreferences } from './types/user-preferences.type';
import type { UserPreferences } from './types/user-preferences.type';
import { ConfigService } from '@nestjs/config';

/** Contexto del dispositivo que inicia sesión, para la lista de sesiones. */
export interface ClientContext {
  userAgent?: string | null;
  ip?: string | null;
  /** Nombre del equipo que manda la app de escritorio (`X-StartCode-Device`). */
  device?: string | null;
}

/** Inicio de sesión nuevo, para el aviso de seguridad. */
export interface LoginEvent {
  sessionId: string;
  ip: string | null;
  /** «MacBook de Ana · StartCode Panel 0.7.0 en macOS». */
  device: string;
}

/** Sistema operativo según el user-agent. */
function osOf(ua: string): string | null {
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

/** Descripción legible del dispositivo: nombre del equipo, app (o navegador) y sistema. */
export function describeDevice(client: ClientContext): string {
  const ua = client.userAgent ?? '';
  const app = /StartCodePanel\/([\w.+-]+)/.exec(ua);
  const os = osOf(ua);
  const what = `${app ? `StartCode Panel ${app[1]}` : 'Navegador'}${os ? ` en ${os}` : ''}`;
  return client.device ? `${client.device} · ${what}` : what;
}

/** Campos mínimos para operar con el usuario en los flujos de login. */
const LOGIN_FIELDS = [
  'id', 'email', 'firstname', 'lastname', 'password', 'role', 'isActive',
  'twoFactorEnabled', 'twoFactorSecret', 'twoFactorLastStep', 'twoFactorBackupCodes',
  'failedLoginAttempts', 'lockedUntil', 'lastLogin', 'passwordChangedAt',
  'preferences', 'createdAt',
] as const;

/** Dispositivos con sesión iniciada a la vez por usuario. */
const MAX_ACTIVE_SESSIONS = 3;

@Injectable()
export class AuthService {
  // Factor de costo para bcrypt (12 es el recomendado por OWASP)
  // Cada incremento duplica el tiempo de cómputo: 10=~100ms, 12=~400ms, 14=~1.6s
  private readonly BCRYPT_SALT_ROUNDS = 12;

  /** TOTP: ±1 step (±30 s) de tolerancia de reloj. Sin esto, un desfase mínimo
      hace fallar códigos correctos. */
  private readonly TOTP_WINDOW = 1;
  /** Días que un dispositivo no vuelve a pedir el código 2FA tras verificarlo. */
  private readonly TRUSTED_DEVICE_DAYS = 7;

  /** Bloqueo temporal de la cuenta tras fallos consecutivos. */
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_MINUTES = 15;

  private readonly BACKUP_CODE_COUNT = 10;

  /** jti de tokens temporales ya consumidos: un tempToken vale una sola vez. */
  private readonly usedTempTokens = new Map<string, number>();

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /* Quien quiera enterarse de cada inicio de sesión (el aviso de seguridad de
     NotificationsService, que importa este módulo: así no hay dependencia circular). */
  private readonly loginListeners: ((userId: string, event: LoginEvent) => void)[] = [];

  onLogin(fn: (userId: string, event: LoginEvent) => void): void {
    this.loginListeners.push(fn);
  }

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
      /* Ancla de la política de caducidad: sin esto habría que deducirla de
         createdAt y la cuenta nacería con la cuenta atrás ya corriendo. */
      passwordChangedAt: new Date(),
    });

    await this.usersRepository.save(user);

    return this.buildAuthResponse(user, {});
  }

  async login(
    loginDto: LoginDto,
    client: ClientContext = {},
  ): Promise<AuthResponseDto | TwoFactorPendingDto | PasswordChangeRequiredDto> {
    const { email, password } = loginDto;
    const rememberMe = loginDto.rememberMe ?? false;

    const user = await this.usersRepository.findOne({
      where: { email },
      select: [...LOGIN_FIELDS],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    this.assertNotLocked(user);

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.clearFailedAttempts(user);

    /* El segundo factor va antes que cualquier otra cosa: ni lastLogin ni la
       política de contraseña deben resolverse con la identidad a medio probar. */
    if (user.twoFactorEnabled && !this.isTrustedDevice(user, loginDto.trustedDeviceToken)) {
      return {
        requiresTwoFactor: true,
        tempToken: this.generateTempToken(user, '2fa-pending', rememberMe),
      };
    }

    if (this.isPasswordExpired(user)) {
      return {
        requiresPasswordChange: true,
        tempToken: this.generateTempToken(user, 'password-expired', rememberMe),
      };
    }

    return this.buildAuthResponse(user, client, rememberMe);
  }

  /** Segundo factor del login: código TOTP o, si no hay app a mano, un código de respaldo. */
  async verifyLogin2FA(
    tempToken: string,
    code: string | undefined,
    backupCode: string | undefined,
    client: ClientContext = {},
  ): Promise<AuthResponseDto | PasswordChangeRequiredDto> {
    const payload = this.verifyTempToken(tempToken, '2fa-pending') as {
      sub: string;
      jti: string;
      exp: number;
      rememberMe: boolean;
    };

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      select: [...LOGIN_FIELDS],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    this.assertNotLocked(user);

    let usedBackupCode = false;

    if (backupCode) {
      usedBackupCode = await this.consumeBackupCode(user, backupCode);
      if (!usedBackupCode) {
        await this.registerFailedAttempt(user);
        throw new UnauthorizedException('Código de respaldo inválido');
      }
    } else {
      if (!code) throw new BadRequestException('Falta el código de verificación');
      const ok = await this.verifyTotp(user, code);
      if (!ok) {
        await this.registerFailedAttempt(user);
        throw new UnauthorizedException('Código 2FA inválido');
      }
    }

    await this.clearFailedAttempts(user);

    this.markTempTokenUsed(payload.jti, payload.exp);
    const trustedDeviceToken = this.generateTrustedDeviceToken(user);

    if (this.isPasswordExpired(user)) {
      return {
        requiresPasswordChange: true,
        tempToken: this.generateTempToken(user, 'password-expired', payload.rememberMe),
        trustedDeviceToken,
      };
    }

    const response = await this.buildAuthResponse(user, client, payload.rememberMe);
    return { ...response, trustedDeviceToken, ...(usedBackupCode ? { usedBackupCode: true } : {}) };
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

  async enable2FA(
    userId: string,
    code: string,
  ): Promise<{ message: string; backupCodes: string[] }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorEnabled', 'twoFactorSecret', 'twoFactorLastStep'],
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

    if (!(await this.verifyTotp(user, code))) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    const { codes, hashes } = await this.generateBackupCodes();

    await this.usersRepository.update(userId, {
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashes,
      backupCodesGeneratedAt: new Date(),
    });

    /* Los códigos en claro se devuelven aquí y no vuelven a existir: en BD solo
       quedan sus hashes. */
    return { message: '2FA activado correctamente', backupCodes: codes };
  }

  /** Desactivar exige contraseña Y código: con solo el código, un móvil robado basta. */
  async disable2FA(userId: string, code: string, password: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'twoFactorEnabled', 'twoFactorSecret', 'twoFactorLastStep',
        'twoFactorBackupCodes', 'failedLoginAttempts', 'lockedUntil'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('El 2FA no está activado');
    }

    this.assertNotLocked(user);

    if (!(await bcrypt.compare(password, user.password))) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    if (!(await this.verifyTotp(user, code))) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.clearFailedAttempts(user);
    await this.usersRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorLastStep: null,
      twoFactorBackupCodes: null,
      backupCodesGeneratedAt: null,
    });

    return { message: '2FA desactivado correctamente' };
  }

  /** Reemplaza el juego completo de códigos de respaldo. */
  async regenerateBackupCodes(
    userId: string,
    code: string,
    password: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'twoFactorEnabled', 'twoFactorSecret', 'twoFactorLastStep',
        'failedLoginAttempts', 'lockedUntil'],
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (!user.twoFactorEnabled) throw new BadRequestException('El 2FA no está activado');

    this.assertNotLocked(user);

    if (!(await bcrypt.compare(password, user.password))) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    if (!(await this.verifyTotp(user, code))) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.clearFailedAttempts(user);
    const { codes, hashes } = await this.generateBackupCodes();
    await this.usersRepository.update(userId, {
      twoFactorBackupCodes: hashes,
      backupCodesGeneratedAt: new Date(),
    });

    return { backupCodes: codes };
  }

  /* ── Segundo factor ───────────────────────────────────────────────── */

  /** Verifica un TOTP con tolerancia de reloj y sin permitir reutilizar el mismo step. */
  private async verifyTotp(user: User, token: string): Promise<boolean> {
    if (!user.twoFactorSecret) return false;

    const delta = speakeasy.totp.verifyDelta({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: this.TOTP_WINDOW,
    });

    if (!delta) return false;

    const step = Math.floor(Date.now() / 1000 / 30) + delta.delta;
    const lastStep = user.twoFactorLastStep ? Number(user.twoFactorLastStep) : null;

    /* Anti-replay: un código vale una sola vez aunque su ventana siga abierta. */
    if (lastStep !== null && step <= lastStep) return false;

    await this.usersRepository.update(user.id, { twoFactorLastStep: String(step) });
    user.twoFactorLastStep = String(step);
    return true;
  }

  /** 10 códigos `XXXX-XXXX` sin caracteres ambiguos; en BD solo viajan los hashes. */
  private async generateBackupCodes(): Promise<{ codes: string[]; hashes: string[] }> {
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codes: string[] = [];

    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const raw = Array.from(crypto.randomBytes(8))
        .map((b) => ALPHABET[b % ALPHABET.length])
        .join('');
      codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
    }

    const hashes = await Promise.all(
      codes.map((c) => bcrypt.hash(this.normalizeBackupCode(c), this.BCRYPT_SALT_ROUNDS)),
    );

    return { codes, hashes };
  }

  private normalizeBackupCode(code: string): string {
    return code.replace(/[\s-]/g, '').toUpperCase();
  }

  /** Consume un código de respaldo: si acierta, ese hash desaparece. */
  private async consumeBackupCode(user: User, code: string): Promise<boolean> {
    const hashes = user.twoFactorBackupCodes ?? [];
    if (!hashes.length) return false;

    const candidate = this.normalizeBackupCode(code);

    for (const hash of hashes) {
      if (await bcrypt.compare(candidate, hash)) {
        const remaining = hashes.filter((h) => h !== hash);
        await this.usersRepository.update(user.id, { twoFactorBackupCodes: remaining });
        user.twoFactorBackupCodes = remaining;
        return true;
      }
    }

    return false;
  }

  /* ── Bloqueo por intentos ──────────────────────────────────────────── */

  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente. Inténtalo de nuevo en ${minutes} min.`,
      );
    }
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      attempts >= this.MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + this.LOCK_MINUTES * 60_000)
        : null;

    await this.usersRepository.update(user.id, {
      failedLoginAttempts: lockedUntil ? 0 : attempts,
      lockedUntil,
    });
  }

  private async clearFailedAttempts(user: User): Promise<void> {
    if (!user.failedLoginAttempts && !user.lockedUntil) return;
    await this.usersRepository.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
  }

  /* ── Dispositivo de confianza (2FA recordado) ──────────────────────── */

  /**
   * Huella de lo que debe invalidar la confianza: el secreto TOTP (cambia al
   * desactivar y volver a activar el 2FA) y la fecha de la contraseña (cambia
   * al cambiarla). Así no hace falta guardar nada en la base de datos.
   */
  private trustFingerprint(user: User): string {
    return crypto
      .createHash('sha256')
      .update(`${user.twoFactorSecret ?? ''}:${user.passwordChangedAt?.toISOString() ?? ''}`)
      .digest('hex')
      .slice(0, 32);
  }

  private generateTrustedDeviceToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, type: '2fa-trusted', fp: this.trustFingerprint(user) },
      { expiresIn: `${this.TRUSTED_DEVICE_DAYS}d` },
    );
  }

  /** Token válido, de este usuario y emitido con su secreto y contraseña actuales. */
  private isTrustedDevice(user: User, token: string | undefined): boolean {
    if (!token) return false;
    try {
      const payload = this.jwtService.verify<{ sub: string; type: string; fp: string }>(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      return payload.type === '2fa-trusted'
        && payload.sub === user.id
        && payload.fp === this.trustFingerprint(user);
    } catch {
      return false;
    }
  }

  /* ── Tokens temporales ─────────────────────────────────────────────── */

  /** `rm` lleva "Mantener sesión iniciada" hasta que se emita la sesión real. */
  private generateTempToken(
    user: User,
    type: '2fa-pending' | 'password-expired',
    rememberMe = false,
  ): string {
    return this.jwtService.sign(
      { sub: user.id, type, jti: crypto.randomUUID(), rm: rememberMe },
      { expiresIn: '5m' },
    );
  }

  /**
   * Verifica un token temporal y su propósito. NO lo marca como usado: un código
   * mal tecleado no debe obligar a repetir el login entero. El uso se marca al
   * completar la operación (`markTempTokenUsed`), y los intentos los limitan el
   * throttler y el bloqueo por fallos.
   */
  private verifyTempToken(
    token: string,
    expected: '2fa-pending' | 'password-expired',
  ): { sub: string; jti: string; rememberMe: boolean } {
    let payload: { sub: string; type: string; jti: string; exp: number; rm?: boolean };

    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token temporal inválido o expirado');
    }

    if (payload.type !== expected) {
      throw new UnauthorizedException('Token temporal inválido');
    }

    this.purgeUsedTempTokens();
    if (payload.jti && this.usedTempTokens.has(payload.jti)) {
      throw new UnauthorizedException('Token temporal ya utilizado');
    }

    return {
      sub: payload.sub,
      jti: payload.jti,
      exp: payload.exp,
      rememberMe: payload.rm === true,
    } as { sub: string; jti: string; exp: number; rememberMe: boolean };
  }

  /** Marca el token temporal como gastado: vale para una sola sesión emitida. */
  private markTempTokenUsed(jti: string | undefined, exp?: number): void {
    if (!jti) return;
    this.usedTempTokens.set(jti, (exp ?? Math.floor(Date.now() / 1000) + 300) * 1000);
  }

  private purgeUsedTempTokens(): void {
    const now = Date.now();
    for (const [jti, exp] of this.usedTempTokens.entries()) {
      if (exp < now) this.usedTempTokens.delete(jti);
    }
  }

  /**
   * Emite una sesión nueva: fila en tbl_sessions + tokens sellados con su `sid`.
   *
   * Hasta MAX_ACTIVE_SESSIONS por usuario: al entrar desde un dispositivo más,
   * se revoca la que lleva más tiempo sin usarse, así que ese equipo recibe 401
   * en su siguiente petición y vuelve al login.
   */
  private async buildAuthResponse(
    user: User,
    client: ClientContext,
    persistent = false,
  ): Promise<AuthResponseDto> {
    await this.makeRoomForSession(user.id);

    const session = await this.sessionsRepository.save(
      this.sessionsRepository.create({
        userId: user.id,
        refreshHash: 'pending',
        userAgent: client.userAgent ?? null,
        ip: client.ip ?? null,
        lastUsed: new Date(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs(persistent)),
        revoked: false,
        persistent,
      }),
    );

    /* Aviso de seguridad (no en el registro, que no trae dispositivo). Un fallo aquí no impide entrar. */
    if (client.ip || client.userAgent) {
      const event: LoginEvent = { sessionId: session.id, ip: client.ip ?? null, device: describeDevice(client) };
      for (const fn of this.loginListeners) {
        try { fn(user.id, event); } catch { /* el aviso no bloquea el login */ }
      }
    }

    const token = this.generateToken(user, session.id);
    const refreshToken = this.generateRefreshToken(user, session.id, persistent);
    await this.sessionsRepository.update(session.id, {
      refreshHash: this.hashToken(refreshToken),
    });

    const now = new Date();
    await this.usersRepository.update(user.id, { lastLogin: now });
    user.lastLogin = now;

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
      rememberMe: persistent,
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
      backupCodesRemaining: user.twoFactorBackupCodes?.length ?? 0,
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

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSid?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('Contraseña actual incorrecta');

    const hashed = await bcrypt.hash(dto.newPassword, this.BCRYPT_SALT_ROUNDS);
    await this.usersRepository.update(userId, { password: hashed, passwordChangedAt: new Date() });

    /* Cambiar la contraseña expulsa al resto de dispositivos. */
    await this.revokeOtherSessions(userId, currentSid);

    return { message: 'Contraseña actualizada correctamente' };
  }

  /**
   * Cambio de contraseña con el token temporal que emite el login cuando la
   * contraseña caducó: no hay sesión todavía, así que al terminar se emite.
   */
  async changeExpiredPassword(
    tempToken: string,
    dto: ChangePasswordDto,
    client: ClientContext = {},
  ): Promise<AuthResponseDto> {
    const payload = this.verifyTempToken(tempToken, 'password-expired') as {
      sub: string;
      jti: string;
      exp: number;
      rememberMe: boolean;
    };

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      select: [...LOGIN_FIELDS],
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuario no autorizado');

    this.assertNotLocked(user);

    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    if (await bcrypt.compare(dto.newPassword, user.password)) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la anterior');
    }

    const hashed = await bcrypt.hash(dto.newPassword, this.BCRYPT_SALT_ROUNDS);
    const now = new Date();
    await this.usersRepository.update(user.id, { password: hashed, passwordChangedAt: now });
    await this.revokeOtherSessions(user.id);
    await this.clearFailedAttempts(user);

    this.markTempTokenUsed(payload.jti, payload.exp);
    user.passwordChangedAt = now;
    return this.buildAuthResponse(user, client, payload.rememberMe);
  }

  /** ¿La contraseña superó los días configurados en las preferencias del usuario? */
  private isPasswordExpired(user: User): boolean {
    const days = mergePreferences(user.preferences, {}).security.passwordExpiration;
    if (!days || days <= 0) return false;

    const changed = user.passwordChangedAt ?? user.createdAt;
    if (!changed) return false;

    const age = (Date.now() - new Date(changed).getTime()) / 86_400_000;
    return age >= days;
  }

  /** Minutos de inactividad permitidos según las preferencias del usuario. */
  sessionTimeoutMinutes(user: User): number {
    return mergePreferences(user.preferences, {}).security.sessionTimeout;
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

  /**
   * Renueva la sesión. Comprueba el tipo del token (sin esto, el tempToken de
   * 2FA pendiente servía para obtener credenciales completas sin el código),
   * que la sesión siga viva, y **rota** el refresh token.
   */
  async refreshToken(refreshToken: string, client: ClientContext = {}): Promise<AuthResponseDto> {
    let payload: { sub: string; type?: string; sid?: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token de actualización inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token de actualización inválido');
    }

    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('Token de actualización inválido');
    }

    const session = await this.sessionsRepository.findOne({ where: { id: payload.sid } });
    if (
      !session ||
      session.revoked ||
      session.userId !== user.id ||
      session.expiresAt.getTime() < Date.now() ||
      session.refreshHash !== this.hashToken(refreshToken)
    ) {
      throw new UnauthorizedException('Sesión no válida o revocada');
    }

    const rotated = this.generateRefreshToken(user, session.id, session.persistent);
    await this.sessionsRepository.update(session.id, {
      refreshHash: this.hashToken(rotated),
      lastUsed: new Date(),
      expiresAt: new Date(Date.now() + this.refreshTtlMs(session.persistent)),
      userAgent: client.userAgent ?? session.userAgent,
      ip: client.ip ?? session.ip,
    });

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
      token: this.generateToken(user, session.id),
      refreshToken: rotated,
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '30m'),
      rememberMe: session.persistent,
    };
  }

  /* ── Sesiones ──────────────────────────────────────────────────────── */

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Duración del refresh: la sesión persistente usa JWT_REFRESH_REMEMBER_EXPIRES_IN. */
  private refreshExpiresIn(persistent: boolean): string {
    return persistent
      ? (this.configService.get('JWT_REFRESH_REMEMBER_EXPIRES_IN', '30d') as string)
      : (this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as string);
  }

  private refreshTtlMs(persistent = false): number {
    const raw = this.refreshExpiresIn(persistent);
    const match = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!match) return (persistent ? 30 : 7) * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return value * unit;
  }

  async listSessions(userId: string, currentSid?: string) {
    const sessions = await this.sessionsRepository.find({
      where: { userId, revoked: false },
      order: { lastUsed: 'DESC' },
    });

    return sessions
      .filter((s) => s.expiresAt.getTime() > Date.now())
      .map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        lastUsed: s.lastUsed,
        createdAt: s.createdAt,
        current: s.id === currentSid,
      }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    await this.sessionsRepository.update(session.id, { revoked: true });
  }

  /** Deja sitio para una sesión nueva: revoca las menos usadas por encima del límite (y las caducadas). */
  private async makeRoomForSession(userId: string): Promise<void> {
    const active = await this.sessionsRepository.find({
      where: { userId, revoked: false },
      order: { lastUsed: 'DESC' },
    });
    const now = Date.now();
    const live = active.filter((s) => s.expiresAt.getTime() > now);
    const stale = [
      ...active.filter((s) => s.expiresAt.getTime() <= now),
      ...live.slice(MAX_ACTIVE_SESSIONS - 1),
    ];
    if (stale.length) {
      await this.sessionsRepository.update({ id: In(stale.map((s) => s.id)) }, { revoked: true });
    }
  }

  /** Cierra las demás sesiones del usuario (o todas si no se pasa `keepSid`). */
  async revokeOtherSessions(userId: string, keepSid?: string): Promise<number> {
    const res = await this.sessionsRepository.update(
      keepSid ? { userId, revoked: false, id: Not(keepSid) } : { userId, revoked: false },
      { revoked: true },
    );
    return res.affected ?? 0;
  }

  /** Limpieza de filas caducadas; la llama el cron de estado de servidores. */
  async purgeExpiredSessions(): Promise<void> {
    await this.sessionsRepository.delete({ expiresAt: LessThan(new Date()) });
  }

  private generateToken(user: User, sid: string): string {
    /* `type: 'access'` es lo que permite a JwtStrategy rechazar tokens de otro
       propósito (2FA pendiente, refresh, agente) como credencial de acceso. */
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      sid,
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

  /**
   * Token efímero para que el servidor remoto descargue el binario del agente
   * durante su instalación.
   *
   * No se reutiliza el token del agente (dura un año y da acceso al gateway:
   * si se filtra en el log de un proxy, alguien suplanta al agente) ni se deja
   * el endpoint abierto. Este caduca en minutos, solo sirve para leer un
   * artefacto y lleva dentro el servidor al que pertenece.
   */
  generateAgentInstallToken(serverId: string): string {
    const payload = { sub: serverId, type: 'agent-install' };
    const expiresIn = this.configService.get('AGENT_INSTALL_TOKEN_EXPIRES_IN', '5m');
    return this.jwtService.sign(payload, { expiresIn });
  }

  private generateRefreshToken(user: User, sid: string, persistent = false): string {
    /* `jti` garantiza que cada rotación produzca un token distinto: sin él, dos
       firmas dentro del mismo segundo dan la misma cadena y el token anterior
       seguiría siendo válido. */
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      sid,
      jti: crypto.randomUUID(),
    };

    const expiresIn = this.refreshExpiresIn(persistent) as JwtSignOptions['expiresIn'];

    return this.jwtService.sign(payload, {
      expiresIn,
    });
  }
}
