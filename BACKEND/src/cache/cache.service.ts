import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Estrategias de TTL para diferentes tipos de datos
 */
export enum CacheTTL {
  /** 30 segundos - Para métricas en tiempo real */
  QUICK_STATS = 30,
  /** 1 minuto - Para métricas generales */
  METRICS = 60,
  /** 5 minutos - Para datos que cambian poco */
  SERVER_INFO = 300,
  /** 15 minutos - Para datos estáticos */
  STATIC_DATA = 900,
  /** 1 hora - Para configuraciones */
  CONFIG = 3600,
}

/**
 * Prefijos para organizar las claves en Redis
 */
export enum CachePrefix {
  METRICS = 'metrics',
  QUICK_STATS = 'quick-stats',
  SERVER_INFO = 'server-info',
  PROCESSES = 'processes',
  CONNECTION_TEST = 'connection-test',
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: any) {}

  /**
   * Genera una clave de caché estructurada
   * @param prefix - Prefijo del tipo de dato
   * @param identifier - Identificador único (ej: serverId)
   * @param suffix - Sufijo opcional
   */
  private buildKey(
    prefix: CachePrefix,
    identifier: string,
    suffix?: string,
  ): string {
    const parts = [prefix, identifier];
    if (suffix) parts.push(suffix);
    return parts.join(':');
  }

  /**
   * Obtener un valor del caché
   * @param prefix - Prefijo del tipo de dato
   * @param identifier - Identificador único
   * @param suffix - Sufijo opcional
   */
  async get<T>(
    prefix: CachePrefix,
    identifier: string,
    suffix?: string,
  ): Promise<T | null> {
    try {
      const key = this.buildKey(prefix, identifier, suffix);
      const value = await this.cacheManager.get(key) as T;

      if (value) {
        this.logger.debug(`✅ Cache HIT: ${key}`);
      } else {
        this.logger.debug(`❌ Cache MISS: ${key}`);
      }

      return value || null;
    } catch (error) {
      this.logger.error(`Error obteniendo del caché: ${error.message}`);
      return null;
    }
  }

  /**
   * Establecer un valor en el caché con TTL personalizado
   * @param prefix - Prefijo del tipo de dato
   * @param identifier - Identificador único
   * @param value - Valor a cachear
   * @param ttl - Tiempo de vida en segundos
   * @param suffix - Sufijo opcional
   */
  async set<T>(
    prefix: CachePrefix,
    identifier: string,
    value: T,
    ttl: CacheTTL,
    suffix?: string,
  ): Promise<void> {
    try {
      const key = this.buildKey(prefix, identifier, suffix);
      await this.cacheManager.set(key, value, ttl * 1000); // convertir a ms
      this.logger.debug(`💾 Cache SET: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error guardando en caché: ${error.message}`);
    }
  }

  /**
   * Eliminar un valor del caché
   * @param prefix - Prefijo del tipo de dato
   * @param identifier - Identificador único
   * @param suffix - Sufijo opcional
   */
  async delete(
    prefix: CachePrefix,
    identifier: string,
    suffix?: string,
  ): Promise<void> {
    try {
      const key = this.buildKey(prefix, identifier, suffix);
      await this.cacheManager.del(key);
      this.logger.debug(`🗑️  Cache DELETE: ${key}`);
    } catch (error) {
      this.logger.error(`Error eliminando del caché: ${error.message}`);
    }
  }

  /**
   * Limpiar todo el caché
   */
  async reset(): Promise<void> {
    try {
      // @ts-ignore - reset method exists but not in types
      await this.cacheManager.reset();
      this.logger.log('🧹 Cache completamente limpiado');
    } catch (error) {
      this.logger.error(`Error limpiando caché: ${error.message}`);
    }
  }

  /**
   * Obtener o establecer (cache-aside pattern)
   * Si el valor existe en caché, lo retorna
   * Si no existe, ejecuta la función, guarda el resultado y lo retorna
   * @param prefix - Prefijo del tipo de dato
   * @param identifier - Identificador único
   * @param fetchFunction - Función para obtener el dato si no está en caché
   * @param ttl - Tiempo de vida en segundos
   * @param suffix - Sufijo opcional
   */
  async getOrSet<T>(
    prefix: CachePrefix,
    identifier: string,
    fetchFunction: () => Promise<T>,
    ttl: CacheTTL,
    suffix?: string,
  ): Promise<T> {
    // Intentar obtener del caché
    const cached = await this.get<T>(prefix, identifier, suffix);
    if (cached) {
      return cached;
    }

    // Si no está en caché, obtener el dato fresco
    this.logger.debug(`🔄 Obteniendo datos frescos para ${prefix}:${identifier}`);
    const freshData = await fetchFunction();

    // Guardar en caché para la próxima vez
    await this.set(prefix, identifier, freshData, ttl, suffix);

    return freshData;
  }

  /**
   * Invalidar todas las claves relacionadas con un servidor
   * @param serverId - ID del servidor
   */
  async invalidateServer(serverId: string): Promise<void> {
    try {
      // Invalidar todas las métricas del servidor
      await this.delete(CachePrefix.METRICS, serverId);
      await this.delete(CachePrefix.QUICK_STATS, serverId);
      await this.delete(CachePrefix.SERVER_INFO, serverId);
      await this.delete(CachePrefix.PROCESSES, serverId, 'cpu');
      await this.delete(CachePrefix.PROCESSES, serverId, 'memory');

      this.logger.log(`🗑️  Caché invalidado para servidor: ${serverId}`);
    } catch (error) {
      this.logger.error(`Error invalidando caché del servidor: ${error.message}`);
    }
  }
}
