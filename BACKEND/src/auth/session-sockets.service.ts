import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Socket } from 'socket.io';
import { User } from '@auth/entities/user.entity';
import { Session } from '@auth/entities/session.entity';
import { mergePreferences } from '@auth/types/user-preferences.type';

/** Evento que recibe el cliente justo antes de que se le corte el socket. */
export const AUTH_REVOKED_EVENT = 'auth:revoked';

/** Por qué terminó la sesión. El panel lo usa para decidir el aviso. */
export type SessionEndReason =
  | 'logout'
  | 'revoked'
  | 'password'
  | 'limit'
  | 'expired'
  | 'inactivity'
  | 'user'
  | 'reuse';

export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  logout: 'Cerraste la sesión',
  revoked: 'La sesión se cerró desde otro dispositivo',
  password: 'La contraseña cambió: vuelve a iniciar sesión',
  limit: 'Se cerró esta sesión al abrirse otra más reciente',
  expired: 'La sesión expiró',
  inactivity: 'Sesión cerrada por inactividad',
  user: 'La cuenta ya no está activa',
  reuse: 'Sesión cerrada por seguridad: se usó un token de sesión antiguo. Si no fuiste tú, cambia tu contraseña',
};

interface TrackedSocket {
  socket: Socket;
  sid: string;
  userId: string;
  /** Limpieza propia del gateway antes de cortar (p. ej. cerrar la sesión SFTP). */
  onEnd?: (reason: SessionEndReason) => void;
}

/**
 * Registro central de los sockets del panel por sesión.
 *
 * Los sockets se autentican una vez, en el handshake, y luego viven por su
 * cuenta: sin este registro, una sesión revocada (logout, «cerrar otras
 * sesiones», cambio de contraseña) seguía con su terminal, su SFTP y sus
 * métricas en vivo hasta que el cliente cerrara la pestaña.
 *
 * - `AuthService` y `JwtStrategy` avisan aquí al revocar: se corta al instante.
 * - Un barrido periódico aplica a los sockets las mismas reglas que
 *   `JwtStrategy` aplica a cada petición HTTP (sesión viva, usuario activo,
 *   expiración e inactividad), y cubre lo que no pasa por `AuthService`
 *   (un usuario desactivado o borrado directamente en la base de datos).
 * - Actividad: solo lo que hace el usuario a través del socket (escribir en la
 *   terminal, operar en SFTP) llama a `touch`, que además refresca `lastUsed`
 *   de la sesión para que una terminal en uso no caduque por falta de HTTP.
 *   Lo que empuja el servidor (métricas, avisos) no cuenta.
 */
@Injectable()
export class SessionSocketsService implements OnModuleInit, OnModuleDestroy {
  static readonly SWEEP_MS = 30_000;
  /** Igual que `JwtStrategy`: `lastUsed` se escribe como mucho una vez por minuto. */
  private static readonly TOUCH_THROTTLE_MS = 60_000;
  /**
   * Una sesión recién cortada se recuerda un rato: un socket que estaba a mitad
   * de handshake (ya validado contra la base, aún sin registrar) no se cuela.
   */
  private static readonly ENDED_MEMORY_MS = 5 * 60_000;

  private readonly logger = new Logger(SessionSocketsService.name);

  /** sid → sockets abiertos de esa sesión. */
  private readonly bySession = new Map<string, Set<TrackedSocket>>();
  private readonly bySocket = new WeakMap<Socket, TrackedSocket>();
  /** sid → última actividad por socket y última escritura de `lastUsed`. */
  private readonly activity = new Map<string, { at: number; written: number }>();
  private readonly ended = new Map<string, { reason: SessionEndReason; until: number }>();

  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SessionSocketsService.SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Asocia un socket ya autenticado a su sesión. Devuelve `false` (y lo corta)
   * si la sesión acaba de terminar o el socket ya se fue.
   */
  register(
    socket: Socket,
    sid: string,
    userId: string,
    onEnd?: (reason: SessionEndReason) => void,
  ): boolean {
    if (socket.disconnected) return false;

    const ended = this.ended.get(sid);
    if (ended && ended.until > Date.now()) {
      this.end({ socket, sid, userId, onEnd }, ended.reason);
      return false;
    }

    const tracked: TrackedSocket = { socket, sid, userId, onEnd };
    let set = this.bySession.get(sid);
    if (!set) {
      set = new Set();
      this.bySession.set(sid, set);
    }
    set.add(tracked);
    this.bySocket.set(socket, tracked);

    socket.once('disconnect', () => this.unregister(tracked));
    return true;
  }

  /** Limpieza del gateway al terminar la sesión (se suma a la de `register`). */
  setOnEnd(socket: Socket, onEnd: (reason: SessionEndReason) => void): void {
    const tracked = this.bySocket.get(socket);
    if (tracked) tracked.onEnd = onEnd;
  }

  /** Actividad del usuario por este socket: cuenta para la inactividad como una petición HTTP. */
  touch(socket: Socket): void {
    const tracked = this.bySocket.get(socket);
    if (!tracked) return;

    const now = Date.now();
    const entry = this.activity.get(tracked.sid) ?? { at: 0, written: 0 };
    entry.at = now;
    this.activity.set(tracked.sid, entry);

    if (now - entry.written < SessionSocketsService.TOUCH_THROTTLE_MS) return;
    entry.written = now;
    this.sessionsRepository
      .update({ id: tracked.sid, revoked: false }, { lastUsed: new Date(now) })
      .catch((error: unknown) =>
        this.logger.warn(
          `No se pudo registrar la actividad: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  /** Corta todos los sockets de estas sesiones, avisando antes al cliente. */
  endSessions(sids: Iterable<string>, reason: SessionEndReason): number {
    const until = Date.now() + SessionSocketsService.ENDED_MEMORY_MS;
    let count = 0;

    for (const sid of sids) {
      this.ended.set(sid, { reason, until });
      this.activity.delete(sid);

      const set = this.bySession.get(sid);
      if (!set) continue;
      this.bySession.delete(sid);
      for (const tracked of set) {
        this.end(tracked, reason);
        count++;
      }
    }

    if (count > 0) this.logger.log(`🔒 ${count} socket(s) cortado(s): ${reason}`);
    return count;
  }

  /** Sockets abiertos de una sesión (para pruebas y diagnóstico). */
  countFor(sid: string): number {
    return this.bySession.get(sid)?.size ?? 0;
  }

  /**
   * Revisa contra la base cada sesión con sockets abiertos: las mismas
   * comprobaciones que `JwtStrategy` hace por petición.
   */
  async sweep(now = Date.now()): Promise<void> {
    for (const [sid, info] of this.ended) {
      if (info.until <= now) this.ended.delete(sid);
    }

    if (this.sweeping || this.bySession.size === 0) return;
    this.sweeping = true;

    try {
      const owners = new Map<string, string>();
      for (const [sid, set] of this.bySession) {
        for (const tracked of set) {
          owners.set(sid, tracked.userId);
          break;
        }
      }
      const sids = [...owners.keys()];
      if (sids.length === 0) return;

      const [sessions, users] = await Promise.all([
        this.sessionsRepository.find({ where: { id: In(sids) } }),
        this.usersRepository.find({ where: { id: In([...new Set(owners.values())]) } }),
      ]);
      const sessionById = new Map(sessions.map((s) => [s.id, s]));
      const userById = new Map(users.map((u) => [u.id, u]));

      const toEnd = new Map<SessionEndReason, string[]>();
      const idle: string[] = [];
      const mark = (sid: string, reason: SessionEndReason) =>
        toEnd.set(reason, [...(toEnd.get(reason) ?? []), sid]);

      for (const [sid, userId] of owners) {
        const session = sessionById.get(sid);
        const user = userById.get(userId);

        if (!session || session.revoked || session.userId !== userId) {
          mark(sid, 'revoked');
          continue;
        }
        if (!user || !user.isActive) {
          mark(sid, 'user');
          continue;
        }
        if (session.expiresAt.getTime() < now) {
          mark(sid, 'expired');
          continue;
        }

        const timeoutMinutes = mergePreferences(user.preferences, {}).security.sessionTimeout;
        const lastUsed = Math.max(
          session.lastUsed.getTime(),
          this.activity.get(sid)?.at ?? 0,
        );
        if (!session.persistent && timeoutMinutes > 0 && now - lastUsed > timeoutMinutes * 60_000) {
          idle.push(sid);
          mark(sid, 'inactivity');
        }
      }

      /* Igual que JwtStrategy: la sesión inactiva queda revocada, no solo sus sockets. */
      if (idle.length > 0) {
        await this.sessionsRepository.update({ id: In(idle) }, { revoked: true });
      }

      for (const [reason, list] of toEnd) this.endSessions(list, reason);
    } catch (error) {
      /* Sin base de datos no se corta nada: mejor esperar al siguiente barrido. */
      this.logger.warn(
        `Barrido de sockets fallido: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  private unregister(tracked: TrackedSocket): void {
    const set = this.bySession.get(tracked.sid);
    if (!set) return;
    set.delete(tracked);
    if (set.size === 0) {
      this.bySession.delete(tracked.sid);
      this.activity.delete(tracked.sid);
    }
  }

  private end(tracked: TrackedSocket, reason: SessionEndReason): void {
    try {
      tracked.onEnd?.(reason);
    } catch (error) {
      this.logger.warn(
        `Limpieza del socket fallida: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    tracked.socket.emit(AUTH_REVOKED_EVENT, {
      reason,
      message: SESSION_END_MESSAGES[reason],
    });
    tracked.socket.disconnect(true);
  }
}
