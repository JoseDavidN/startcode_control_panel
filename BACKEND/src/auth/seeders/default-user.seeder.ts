import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, STRONG_PASSWORD } from '@auth/dto/password-policy';

/** Contraseñas de los `.env.*.example` y la de respaldo del código. */
const KNOWN_DEFAULTS = new Set(['admin123!', 'cambia_esta_password']);

export function isAcceptableAdminPassword(password: string | undefined): boolean {
  return (
    !!password &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    STRONG_PASSWORD.test(password) &&
    !KNOWN_DEFAULTS.has(password.toLowerCase())
  );
}

/**
 * Seeder que crea un usuario administrador por defecto al inicializar la aplicación.
 * Solo crea el usuario si no existe ningún usuario en la base de datos.
 *
 * Las credenciales se configuran mediante variables de entorno:
 * - DEFAULT_ADMIN_EMAIL: Email del admin (default: admin@startcode.local)
 * - DEFAULT_ADMIN_PASSWORD: Contraseña del admin (default: Admin123!, solo fuera de producción)
 * - DEFAULT_ADMIN_FIRSTNAME: Nombre del admin (default: Admin)
 * - DEFAULT_ADMIN_LASTNAME: Apellido del admin (default: System)
 */
@Injectable()
export class DefaultUserSeeder implements OnModuleInit {
  private readonly logger = new Logger(DefaultUserSeeder.name);

  // Factor de costo para bcrypt (12 es el recomendado por OWASP)
  private readonly BCRYPT_SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin(): Promise<void> {
    // Verificar si ya existen usuarios en la base de datos
    const userCount = await this.usersRepository.count();

    if (userCount > 0) {
      this.logger.log('Base de datos ya tiene usuarios, omitiendo creación de admin por defecto');
      return;
    }

    // Obtener credenciales desde variables de entorno o usar valores por defecto
    const email = this.configService.get<string>('DEFAULT_ADMIN_EMAIL', 'admin@startcode.local');
    const configured = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD');
    const password = configured || 'Admin123!';

    /* En producción no se crea un administrador con la contraseña por defecto,
       la de ejemplo o una que no cumpla la política: sería la primera que
       probaría un atacante. */
    if (this.configService.get<string>('NODE_ENV') === 'production' && !isAcceptableAdminPassword(configured)) {
      this.logger.error(
        'DEFAULT_ADMIN_PASSWORD falta, es la de ejemplo o no cumple la política ' +
          `(${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} caracteres con mayúscula, minúscula, número y símbolo). ` +
          'No se crea el administrador inicial.',
      );
      return;
    }
    const firstname = this.configService.get<string>('DEFAULT_ADMIN_FIRSTNAME', 'Admin');
    const lastname = this.configService.get<string>('DEFAULT_ADMIN_LASTNAME', 'System');

    try {
      // Hash de la contraseña con factor de costo alto
      const hashedPassword = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

      // Crear usuario administrador
      const adminUser = this.usersRepository.create({
        firstname: firstname,
        lastname: lastname,
        email: email,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isActive: true,
        passwordChangedAt: new Date(),
      });

      await this.usersRepository.save(adminUser);

      this.logger.log('═══════════════════════════════════════════════════════════');
      this.logger.log('Usuario administrador por defecto creado exitosamente');
      this.logger.log(`Email: ${email}`);
      this.logger.log('IMPORTANTE: Cambia la contraseña después del primer login');
      this.logger.log('═══════════════════════════════════════════════════════════');
    } catch (error) {
      this.logger.error('Error al crear usuario administrador por defecto:', error instanceof Error ? error.message : String(error));
    }
  }
}
