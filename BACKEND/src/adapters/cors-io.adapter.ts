import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { resolveCorsOrigins } from './cors-origins';

/**
 * IoAdapter personalizado que configura CORS de Socket.IO
 * leyendo CORS_ORIGIN en tiempo de bootstrap (post-dotenv),
 * no en tiempo de decorador de clase.
 *
 * La lista sale de `resolveCorsOrigins` (CORS_ORIGIN + orígenes de Tauri).
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const origin = resolveCorsOrigins();

    return super.createIOServer(port, {
      ...options,
      cors: { origin, credentials: true },
      /* Los inventarios del agente son JSON repetitivo de decenas de KB; deflate
         los deja en una fracción. El umbral evita gastar CPU en los mensajes
         pequeños, que son la mayoría. */
      perMessageDeflate: { threshold: 1024 },
      httpCompression: { threshold: 1024 },
    });
  }
}
