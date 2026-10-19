import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule, type CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { CacheService } from './cache.service';

/** Prefijo de todas las claves del panel: `clear()` solo borra las suyas, no el resto del Redis. */
export const CACHE_NAMESPACE = 'startcode-panel';

/*
 * cache-manager 7 (el de @nestjs/cache-manager 3) guarda en almacenes Keyv
 * (`stores`). La opción `store` de antes (cache-manager-ioredis-yet) ya no se
 * lee, así que la caché quedaba en la memoria del proceso sin avisar. Ahora
 * va a Redis por @keyv/redis. Sin REDIS_HOST, en memoria.
 */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheModuleOptions => {
        const logger = new Logger('CacheModule');
        /* Las variables llegan como texto: se convierten aquí. */
        const ttl = (Number(config.get<string>('REDIS_TTL')) || 300) * 1000;
        const host = config.get<string>('REDIS_HOST')?.trim();
        if (!host) {
          logger.warn('Sin REDIS_HOST: la caché queda en la memoria del proceso');
          return { ttl };
        }

        const port = Number(config.get<string>('REDIS_PORT')) || 6379;
        const database = Number(config.get<string>('REDIS_DB')) || 0;
        const store = new KeyvRedis(
          {
            socket: {
              host,
              port,
              connectTimeout: 5_000,
              /* Si Redis se cae, reintenta cada vez más espaciado (hasta 10 s) sin rendirse. */
              reconnectStrategy: (retries: number) => Math.min(500 * 2 ** retries, 10_000),
            },
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            database,
            /* Desconectado, un comando falla al momento en vez de esperar en cola
               a que vuelva: si no, cada petición que lee la caché se quedaría colgada. */
            disableOfflineQueue: true,
          },
          {
            namespace: CACHE_NAMESPACE,
            /* Con Redis caído no se tumba la API: las lecturas fallan como «no está» y se va al origen. */
            throwOnConnectError: false,
            throwOnErrors: false,
            connectionTimeout: 5_000,
          },
        );
        const keyv = new Keyv({ store, namespace: CACHE_NAMESPACE, useKeyPrefix: false });

        /* Sin listener, un evento `error` sin escuchar tumbaría el proceso. Se avisa
           una vez por caída, no en cada reintento. */
        let down = false;
        const onError = (err: unknown) => {
          if (down) return;
          down = true;
          logger.warn(`Redis no responde en ${host}:${port}: ${err instanceof Error ? err.message : String(err)}. La caché no se usa hasta que vuelva`);
        };
        keyv.on('error', onError);
        store.on('error', onError);
        const where = `${host}:${port}, db${database}`;
        /* Comprobación real al arrancar: escribir y leer una clave de prueba. */
        void (async () => {
          const client = await store.getClient();
          client.on('ready', () => {
            if (down) logger.log(`Redis de la caché de nuevo disponible (${where})`);
            down = false;
          });
          const probe = `${Date.now()}`;
          await keyv.set('health', probe, 10_000);
          if ((await keyv.get<string>('health')) === probe) logger.log(`Caché en Redis (${where})`);
          else onError(new Error('no se pudo escribir ni leer la clave de prueba'));
        })().catch(onError);

        return { ttl, stores: [keyv] };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule {}
