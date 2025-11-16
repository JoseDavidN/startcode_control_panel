import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
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
      where: { str_email: email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya esta registrado');
    }

    // hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = this.usersRepository.create({
      str_firstname: firstname,
      str_lastname: lastname,
      str_email: email,
      str_password: hashedPassword,
    });

    await this.usersRepository.save(user);

    // Generar token JWT
    const token = this.generateToken(user);
    const expiresIn = this.configService.get('JWT_EXPIRES_IN', '7d');

    return {
      user: {
        id: user.id,
        email: user.str_email,
        name: user.str_firstname + ' ' + user.str_lastname,
        role: user.enu_role,
        isActive: user.bol_is_active,
        createdAt: user.createdAt,
      },
      token,
      expiresIn,
    };
  }
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Buscar usuario con password
    const user = await this.usersRepository.findOne({
      where: { str_email: email },
      select: [
        'id',
        'str_email',
        'str_firstname',
        'str_lastname',
        'str_password',
        'enu_role',
        'bol_is_active',
        'createdAt',
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.bol_is_active) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.str_password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Generar token
    const token = this.generateToken(user);
    const expiresIn = this.configService.get('JWT_EXPIRES_IN', '7d');

    return {
      user: {
        id: user.id,
        email: user.str_email,
        name: user.str_firstname + ' ' + user.str_lastname,
        role: user.enu_role,
        isActive: user.bol_is_active,
        createdAt: user.createdAt,
      },
      token,
      expiresIn,
    };
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.bol_is_active) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return user;
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.str_email,
      role: user.enu_role,
    };

    return this.jwtService.sign(payload);
  }
}
