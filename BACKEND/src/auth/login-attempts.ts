/**
 * Contador de intentos fallidos en memoria, por clave (`acct:<email>`,
 * `ip:<ip>`…). Complementa al bloqueo en base de datos, que solo existe para
 * cuentas reales: este también cubre los emails que no existen, así que la
 * respuesta (y el bloqueo) es la misma exista o no la cuenta.
 */
export interface AttemptPolicy {
  /** Fallos dentro de la ventana que provocan el bloqueo. */
  max: number;
  windowMs: number;
  lockMs: number;
}

interface Entry {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

export const ACCOUNT_POLICY: AttemptPolicy = { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const IP_POLICY: AttemptPolicy = { max: 30, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
/** Renovaciones por usuario y minuto: el cliente renueva cada ~30 min, esto es holgado. */
export const REFRESH_USER_POLICY: AttemptPolicy = { max: 30, windowMs: 60_000, lockMs: 60_000 };

/** Retardo progresivo tras cada fallo: 0, 250, 500, 1000… hasta 4 s. */
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 4_000;

export class LoginAttempts {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    /** Tope de claves: rociar emails al azar no puede agotar la memoria. */
    private readonly maxEntries = 10_000,
  ) {}

  /** Milisegundos de bloqueo que le quedan a la clave (0 si no está bloqueada). */
  lockedFor(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - this.now());
  }

  /** Apunta un fallo. Devuelve el retardo a aplicar antes de responder y si quedó bloqueada. */
  fail(key: string, policy: AttemptPolicy): { delayMs: number; locked: boolean } {
    const now = this.now();
    let entry = this.entries.get(key);

    if (!entry || now - entry.firstAt > policy.windowMs) {
      entry = { count: 0, firstAt: now, lockedUntil: 0 };
    }

    entry.count += 1;
    const locked = entry.count >= policy.max;
    if (locked) {
      entry.lockedUntil = now + policy.lockMs;
      entry.count = 0;
      entry.firstAt = now;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    this.prune(now);

    const delayMs = locked
      ? MAX_DELAY_MS
      : Math.min(MAX_DELAY_MS, entry.count <= 1 ? 0 : BASE_DELAY_MS * 2 ** (entry.count - 2));
    return { delayMs, locked };
  }

  /** Cuenta un uso legítimo (renovaciones): bloquea al superar el máximo de la ventana. */
  hit(key: string, policy: AttemptPolicy): boolean {
    if (this.lockedFor(key) > 0) return false;
    return !this.fail(key, policy).locked;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(now: number): void {
    if (this.entries.size <= this.maxEntries) return;

    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstAt > ACCOUNT_POLICY.windowMs) {
        this.entries.delete(key);
      }
    }
    /* Siguen sobrando: fuera las más antiguas (el Map conserva el orden de inserción). */
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}

export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
