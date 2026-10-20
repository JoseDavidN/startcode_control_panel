import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Server, ServerStatus, ServerOs, type ServerAgentMetadata } from './entities/server.entity';
import { User } from '@auth/entities/user.entity';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdatePrivateKeyDto } from './dto/update-private-key.dto';
import { ServerResponseDto } from './dto/server-response.dto';
import { ServerStatsDto } from './dto/server-stats.dto';
import { plainToClass } from 'class-transformer';
import { CredentialsCipherService } from '@/databases/services/credentials-cipher.service';

/** Servidores favoritos por usuario. */
export const MAX_FAVORITES = 3;

/*
 * La llave privada SSH se guarda cifrada (AES-256-GCM con DB_CREDENTIALS_KEY,
 * `CredentialsCipherService`): en la base solo está `v1:<iv>:<tag>:<cifrado>`.
 * Se descifra en memoria al cargarla para conectar (`findOneWithPrivateKey`)
 * y nunca sale en las respuestas de la API.
 */
@Injectable()
export class ServersService implements OnModuleInit {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    @InjectRepository(Server)
    private serversRepository: Repository<Server>,
    private readonly cipher: CredentialsCipherService,
  ) {}

  /* Llaves guardadas en claro por versiones anteriores: se cifran al arrancar.
     Sin clave de cifrado no se toca nada (siguen funcionando en claro) y se avisa. */
  async onModuleInit(): Promise<void> {
    const legacy = await this.serversRepository
      .createQueryBuilder('server')
      .select(['server.id'])
      .addSelect('server.privateKey')
      .where('server.privateKey NOT LIKE :prefix', { prefix: 'v1:%' })
      .getMany();
    if (!legacy.length) return;
    if (!this.cipher.ready) {
      this.logger.warn(
        `${legacy.length} servidores tienen la llave SSH en claro y no se pueden cifrar: define DB_CREDENTIALS_KEY (openssl rand -hex 32) y reinicia.`,
      );
      return;
    }
    for (const s of legacy) {
      await this.serversRepository.update({ id: s.id }, { privateKey: this.cipher.encrypt(s.privateKey) });
    }
    this.logger.log(`🔐 Llaves SSH cifradas: ${legacy.length} servidores que las tenían en claro`);
  }

  /** Llave en claro para conectar. Una antigua sin cifrar se usa tal cual (se cifra al arrancar). */
  private revealKey(stored: string): string {
    return CredentialsCipherService.isEncrypted(stored) ? this.cipher.decrypt(stored) : stored;
  }

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
      privateKey: this.cipher.encrypt(createServerDto.privateKey),
      os: createServerDto.os,
      tag: createServerDto.tag ?? null,
      description: createServerDto.description,
      /* Huella vista al probar la conexión antes de guardar: se fija ya, y la
         primera conexión real no tiene que confiar a ciegas. */
      ...(createServerDto.hostKeyFingerprint
        ? {
            hostKeyFingerprint: createServerDto.hostKeyFingerprint,
            hostKeyAlgorithm: createServerDto.hostKeyAlgorithm ?? null,
            hostKeyVerifiedAt: new Date(),
          }
        : {}),
      ownerId: user.id,
      /* PENDING, no OFFLINE: el servidor todavía no está caído, es que aún no
         tiene agente. El gateway lo pondrá ONLINE en cuanto el agente hable. */
      status: ServerStatus.PENDING,
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
        'tag',
        'description',
        'metadata',
        'ownerId',
        'createdAt',
        'updatedAt',
        'lastCheckAt',
        /* El hostVerifier de SSHService compara con esta huella. */
        'hostKeyAlgorithm',
        'hostKeyFingerprint',
        'hostKeyVerifiedAt',
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

    /* Se descifra solo en memoria: esta entidad no debe volver a guardarse con `save`. */
    server.privateKey = this.revealKey(server.privateKey);
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

    /* Otro host u otro puerto es otra máquina: la clave fijada ya no aplica y
       la próxima conexión vuelve a ser un primer uso. */
    if (
      (updateServerDto.host !== undefined && updateServerDto.host !== server.host) ||
      (updateServerDto.port !== undefined && updateServerDto.port !== server.port)
    ) {
      server.hostKeyAlgorithm = null;
      server.hostKeyFingerprint = null;
      server.hostKeyVerifiedAt = null;
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
    if (updateServerDto.tag !== undefined) server.tag = updateServerDto.tag;
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
    const server = await this.verifyServerAccess(id, user.id);

    /* Solo la columna de la llave, cifrada: sin cargar ni volver a guardar la entidad. */
    await this.serversRepository.update(
      { id },
      { privateKey: this.cipher.encrypt(updatePrivateKeyDto.privateKey), updatedAt: new Date() },
    );
    this.logger.log(
      `Llave privada actualizada: ${server.name} por usuario ${user.email}`,
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
   * Marca o quita un servidor de favoritos. Como mucho MAX_FAVORITES por
   * usuario: el que pase de ahí recibe 409 y hay que quitar otro antes.
   */
  async setFavorite(id: string, favorite: boolean, user: User): Promise<ServerResponseDto> {
    const server = await this.verifyServerAccess(id, user.id);
    if (favorite === Boolean(server.favoritedAt)) return this.toResponseDto(server);

    if (favorite) {
      const count = await this.serversRepository.count({ where: { ownerId: user.id, favoritedAt: Not(IsNull()) } });
      if (count >= MAX_FAVORITES) {
        throw new ConflictException(`Solo puedes marcar ${MAX_FAVORITES} servidores como favoritos: quita uno antes`);
      }
    }
    server.favoritedAt = favorite ? new Date() : null;
    await this.serversRepository.update({ id }, { favoritedAt: server.favoritedAt });
    return this.toResponseDto(server);
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
   * Guarda el estado de instalación del agente.
   *
   * El merge se hace en SQL en vez de leer-modificar-guardar la entidad porque
   * el gateway escribe en ese mismo jsonb desde otro proceso lógico: con dos
   * escritores, el último en guardar pisaría al otro.
   */
  async setAgentState(
    serverId: string,
    agent: Partial<ServerAgentMetadata>,
  ): Promise<void> {
    await this.serversRepository.query(
      `UPDATE tbl_servers
          SET json_metadata = COALESCE(json_metadata, '{}'::jsonb)
                            || jsonb_build_object('agent',
                                 COALESCE(json_metadata->'agent', '{}'::jsonb) || $2::jsonb)
        WHERE id = $1`,
      [serverId, JSON.stringify(agent)],
    );
  }

  /**
   * Servicios fijados del servidor, comprobando de paso que es del usuario.
   *
   * Un servidor reporta ~160 unidades systemd y casi ninguna importa: esta
   * lista es la que decide qué se enseña primero en el tab de servicios.
   */
  async getPinnedServices(serverId: string, userId: string): Promise<string[]> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
      select: ['ownerId', 'metadata'],
    });

    if (!server || server.ownerId !== userId) {
      throw new NotFoundException('Servidor no encontrado o sin acceso');
    }

    return server.metadata?.pinnedServices ?? [];
  }

  /** Reemplaza la lista entera. Mismo merge en SQL que `setAgentState`. */
  async setPinnedServices(
    serverId: string,
    userId: string,
    services: string[],
  ): Promise<string[]> {
    await this.getPinnedServices(serverId, userId);

    /* Sin duplicados y en el orden en que los fijó el usuario. */
    const unique = [...new Set(services.map((name) => name.trim()).filter(Boolean))];

    await this.serversRepository.query(
      `UPDATE tbl_servers
          SET json_metadata = COALESCE(json_metadata, '{}'::jsonb)
                            || jsonb_build_object('pinnedServices', $2::jsonb)
        WHERE id = $1`,
      [serverId, JSON.stringify(unique)],
    );

    return unique;
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
      warning: 0,
      pending: 0,
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
        case ServerStatus.WARNING:
          stats.warning++;
          break;
        /* Sin estos dos casos, un servidor pendiente de agente no se contaba en
           ningún sitio y los totales no cuadraban. */
        case ServerStatus.PENDING:
          stats.pending++;
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
