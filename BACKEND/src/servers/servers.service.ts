import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, ServerStatus, ServerOs } from './entities/server.entity';
import { User } from '@auth/entities/user.entity';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdatePrivateKeyDto } from './dto/update-private-key.dto';
import { ServerResponseDto } from './dto/server-response.dto';
import { ServerStatsDto } from './dto/server-stats.dto';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    @InjectRepository(Server)
    private serversRepository: Repository<Server>,
  ) {}

  /**
   * Crea un nuevo servidor
   * @param createServerDto - Datos del servidor a crear
   * @param user - Usuario que crea el servidor
   * @returns El servidor creado
   */
  async create(
    createServerDto: CreateServerDto,
    user: User,
  ): Promise<ServerResponseDto> {
    // Verificar si ya existe un servidor con el mismo nombre
    const existingServer = await this.serversRepository.findOne({
      where: {
        host: createServerDto.host,
        ownerId: user.id,
      },
    });

    if (existingServer) {
      throw new ConflictException(
        `Ya tienes un servidor registrado con el host "${createServerDto.host}"`,
      );
    }

    // Crear el servidor - Mapeo manual necesario porque los nombres de DTO no coinciden con los de la entidad
    const server = this.serversRepository.create({
      name: createServerDto.name,
      host: createServerDto.host,
      port: createServerDto.port || 22,
      username: createServerDto.username,
      privateKey: createServerDto.privateKey,
      os: createServerDto.os,
      description: createServerDto.description,
      ownerId: user.id,
      status: ServerStatus.OFFLINE,
    });

    const savedServer = await this.serversRepository.save(server);
    this.logger.log(
      `Servidor creado: ${savedServer.name} por usuario ${user.email}`,
    );
    this.logger.log(
      `⏳ El servidor estará disponible cuando el agente se conecte`,
    );

    return this.toResponseDto(savedServer);
  }

  /**
   * Obtener todos los servidores
   * @returns Todos los servidores
   */
  async findAll(user: User): Promise<ServerResponseDto[]> {
    const servers = await this.serversRepository.find({
      where: { ownerId: user.id },
      order: { createdAt: 'DESC' },
    });

    return servers.map((server) => this.toResponseDto(server));
  }

  /**
   * Obtener un servidor específico
   * @param id - ID del servidor
   * @returns El servidor encontrado
   */
  async findOne(id: string, user: User): Promise<ServerResponseDto> {
    const server = await this.verifyServerAccess(id, user.id);
    return this.toResponseDto(server);
  }

  /**
   * Obtener un servidor con la llave privada (para uso interno)
   * @param id - ID del servidor
   * @returns El servidor encontrado con la llave privada
   */
  async findOneWithPrivateKey(id: string, userId: string): Promise<Server> {
    const server = await this.serversRepository.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'host',
        'port',
        'username',
        'privateKey',
        'status',
        'os',
        'description',
        'metadata',
        'ownerId',
        'createdAt',
        'updatedAt',
        'lastCheckAt',
      ],
    });

    if (!server) {
      throw new NotFoundException('Servidor no encontrado');
    }

    if (server.ownerId !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este servidor',
      );
    }

    return server;
  }

  /**
   * Actualizar un servidor
   * @param id - ID del servidor
   * @param updateServerDto - Datos del servidor a actualizar
   * @returns El servidor actualizado
   */
  async update(
    id: string,
    updateServerDto: UpdateServerDto,
    user: User,
  ): Promise<ServerResponseDto> {
    const server = await this.verifyServerAccess(id, user.id);

    // Si se actualiza el host, verificar si ya existe un servidor con el mismo host
    if (updateServerDto.host && updateServerDto.host !== server.host) {
      const existingServer = await this.serversRepository.findOne({
        where: {
          host: updateServerDto.host,
          ownerId: user.id,
        },
      });

      if (existingServer && existingServer.id !== id) {
        throw new ConflictException(
          `Ya tienes un servidor con el host "${updateServerDto.host}"`,
        );
      }
    }

    // Actualizar los campos - Mapeo manual necesario
    if (updateServerDto.name !== undefined)
      server.name = updateServerDto.name;
    if (updateServerDto.host !== undefined)
      server.host = updateServerDto.host;
    if (updateServerDto.port !== undefined)
      server.port = updateServerDto.port;
    if (updateServerDto.username !== undefined)
      server.username = updateServerDto.username;
    if (updateServerDto.os !== undefined) server.os = updateServerDto.os;
    if (updateServerDto.description !== undefined)
      server.description = updateServerDto.description;
    if (updateServerDto.status !== undefined)
      server.status = updateServerDto.status;
    server.updatedAt = new Date();

    const updatedServer = await this.serversRepository.save(server);
    this.logger.log(
      `Servidor actualizado: ${updatedServer.name} por usuario ${user.email}`,
    );

    return this.toResponseDto(updatedServer);
  }

  /**
   * Actualizar la llave privada de un servidor
   * @param id - ID del servidor
   * @param updatePrivateKeyDto - Datos de la llave privada a actualizar
   * @returns La llave privada actualizada
   */
  async updatePrivateKey(
    id: string,
    updatePrivateKeyDto: UpdatePrivateKeyDto,
    user: User,
  ): Promise<{ message: string }> {
    const server = await this.findOneWithPrivateKey(id, user.id);

    server.privateKey = updatePrivateKeyDto.privateKey;
    server.updatedAt = new Date();

    const updatedServer = await this.serversRepository.save(server);
    this.logger.log(
      `Llave privada actualizada: ${updatedServer.name} por usuario ${user.email}`,
    );

    return { message: 'Llave privada actualizada correctamente' };
  }

  /**
   * Eliminar un servidor
   * @param id - ID del servidor
   * @returns El mensaje de eliminación
   */
  async remove(id: string, user: User): Promise<{ message: string }> {
    const server = await this.verifyServerAccess(id, user.id);
    const serverName = server.name;

    await this.serversRepository.remove(server);
    this.logger.log(
      `Servidor eliminado: ${serverName} por usuario ${user.email}`,
    );

    return { message: 'Servidor eliminado correctamente' };
  }

  /**
   * Actualizar el estado de un servidor
   * @param id - ID del servidor
   * @param status - Estado del servidor
   * @returns El servidor actualizado
   */
  async updateStatus(
    id: string,
    status: ServerStatus,
    user: User,
  ): Promise<ServerResponseDto> {
    const server = await this.verifyServerAccess(id, user.id);

    server.status = status;
    server.lastCheckAt = new Date();

    const updatedServer = await this.serversRepository.save(server);
    this.logger.log(`Estado actualizado: ${server.name} -> ${status}`);

    return this.toResponseDto(updatedServer);
  }

  /**
   * Actualizar metadata del servidor
   * @param id - ID del servidor
   * @param metadata - Metadatos del servidor
   * @returns El servidor actualizado
   */
  private async updateMetadata(
    id: string,
    metadata: any,
    userId: string,
  ): Promise<void> {
    const server = await this.findOneWithPrivateKey(id, userId);

    server.metadata = { ...server.metadata, ...metadata };
    server.lastCheckAt = new Date();

    await this.serversRepository.save(server);
  }

  /**
   * Obtener estadisticas de servidores
   * @returns Las estadisticas de los servidores
   */
  async getStats(user: User): Promise<ServerStatsDto> {
    const servers = await this.serversRepository.find({
      where: { ownerId: user.id },
      select: ['status'],
    });

    const stats: ServerStatsDto = {
      total: servers.length,
      online: 0,
      offline: 0,
      error: 0,
      maintenance: 0,
      checking: 0,
    };

    servers.forEach((server) => {
      switch (server.status) {
        case ServerStatus.ONLINE:
          stats.online++;
          break;
        case ServerStatus.OFFLINE:
          stats.offline++;
          break;
        case ServerStatus.ERROR:
          stats.error++;
          break;
        case ServerStatus.MAINTENANCE:
          stats.maintenance++;
          break;
        case ServerStatus.CHECKING:
          stats.checking++;
          break;
      }
    });

    return stats;
  }

  /**
   * Buscar servidores por nombre u host
   * @param query - Query de busqueda
   * @returns Los servidores encontrados
   */
  async search(query: string, user: User): Promise<ServerResponseDto[]> {
    const servers = await this.serversRepository
      .createQueryBuilder('server')
      .where('server.ownerId = :userId', { userId: user.id })
      .andWhere(
        '(LOWER(server.name) LIKE LOWER(:query) OR LOWER(server.host) LIKE LOWER(:query))',
        { query: `%${query}%` },
      )
      .orderBy('server.createdAt', 'DESC')
      .getMany();

    return servers.map((server) => this.toResponseDto(server));
  }

  /**
   * Filtrar servidores por estado
   */
  async filterByStatus(
    status: ServerStatus,
    user: User,
  ): Promise<ServerResponseDto[]> {
    const servers = await this.serversRepository.find({
      where: {
        ownerId: user.id,
        status: status,
      },
      order: { createdAt: 'DESC' },
    });

    return servers.map((server) => this.toResponseDto(server));
  }

  /**
   * Filtrar servidores por sistema operativo
   */
  async filterByOS(os: ServerOs, user: User): Promise<ServerResponseDto[]> {
    const servers = await this.serversRepository.find({
      where: {
        ownerId: user.id,
        os: os,
      },
      order: { createdAt: 'DESC' },
    });

    return servers.map((server) => this.toResponseDto(server));
  }

  /**
   * Verificar acceso del usuario al servidor
   */
  private async verifyServerAccess(
    serverId: string,
    userId: string,
  ): Promise<Server> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
    });

    if (!server) {
      throw new NotFoundException('Servidor no encontrado');
    }

    if (server.ownerId !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este servidor',
      );
    }

    return server;
  }

  /**
   * Verificar si un usuario es propietario de un servidor (para otros módulos)
   * @param serverId - ID del servidor
   * @param userId - ID del usuario
   * @returns True si el usuario es propietario del servidor, false en caso contrario
   */
  async verifyOwnership(serverId: string, userId: string): Promise<boolean> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
      select: ['ownerId'],
    });

    return !!(server && server.ownerId === userId);
  }

  async findNameAndVerifyOwnership(serverId: string, userId: string): Promise<string> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
      select: ['ownerId', 'name'],
    });

    if (!server || server.ownerId !== userId) {
      throw new NotFoundException('Servidor no encontrado o sin acceso');
    }

    return server.name;
  }

  /**
   * Contar servidores del usuario
   * @param userId - ID del usuario
   * @returns El numero de servidores del usuario
   */
  async count(userId: string): Promise<number> {
    return await this.serversRepository.count({
      where: { ownerId: userId },
    });
  }

  /**
   * Convertir entidad a DTO de respuesta (sin privateKey)
   * @param server - Entidad del servidor
   * @returns El DTO de respuesta del servidor
   */
  private toResponseDto(server: Server): ServerResponseDto {
    return plainToClass(ServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }
}
