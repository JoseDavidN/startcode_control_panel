import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';

/**
 * Seeder que crea un usuario administrador por defecto al inicializar la aplicación.
 * Solo crea el usuario si no existe ningún usuario en la base de datos.
 *
 * Las credenciales se configuran mediante variables de entorno:
 * - DEFAULT_ADMIN_EMAIL: Email del admin (default: admin@startcode.local)
 * - DEFAULT_ADMIN_PASSWORD: Contraseña del admin (default: Admin123!)
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
    const password = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD', 'Admin123!');
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
      });

      await this.usersRepository.save(adminUser);

      this.logger.log('═══════════════════════════════════════════════════════════');
      this.logger.log('Usuario administrador por defecto creado exitosamente');
      this.logger.log(`Email: ${email}`);
      this.logger.log('IMPORTANTE: Cambia la contraseña después del primer login');
      this.logger.log('═══════════════════════════════════════════════════════════');
    } catch (error) {
      this.logger.error('Error al crear usuario administrador por defecto:', error.message);
    }
  }
}
