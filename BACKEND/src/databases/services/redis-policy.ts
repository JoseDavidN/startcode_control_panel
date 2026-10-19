/*
 * Consola de Redis: cómo se parte una línea en argumentos y qué comandos no
 * se admiten o piden confirmación. Puro, sin conexión, para poder probarlo.
 */

/**
 * Parte una línea como redis-cli: espacios separan argumentos, las comillas
 * dobles admiten escapes (`\n`, `\t`, `\"`, `\\`, `\xHH`) y las simples son
 * literales. Lanza si una comilla queda sin cerrar.
 */
export function tokenizeCommand(line: string): string[] {
  const args: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && /\s/.test(line[i])) i++;
    if (i >= n) break;
    let arg = '';
    let quoted = false;
    while (i < n && !/\s/.test(line[i])) {
      const ch = line[i];
      if (ch === '"' || ch === "'") {
        quoted = true;
        const quote = ch;
        i++;
        let closed = false;
        while (i < n) {
          const c = line[i];
          if (c === quote) { closed = true; i++; break; }
          if (quote === '"' && c === '\\' && i + 1 < n) {
            const next = line[i + 1];
            if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(line.slice(i + 2, i + 4))) {
              arg += String.fromCharCode(parseInt(line.slice(i + 2, i + 4), 16));
              i += 4;
              continue;
            }
            arg += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next === 'b' ? '\b' : next === 'a' ? '\x07' : next;
            i += 2;
            continue;
          }
          arg += c;
          i++;
        }
        if (!closed) throw new Error('Falta cerrar una comilla');
        continue;
      }
      arg += ch;
      i++;
    }
    if (arg || quoted) args.push(arg);
  }
  return args;
}

/* La conexión de la vista es una sola y la comparten el explorador y la
   consola, en serie: un comando que la deja esperando, la cambia de modo o
   la mueve de base sin que el panel lo sepa la rompería para lo demás. */
const BLOCKED: Record<string, string> = {
  SUBSCRIBE: 'deja la conexión escuchando mensajes', PSUBSCRIBE: 'deja la conexión escuchando mensajes',
  SSUBSCRIBE: 'deja la conexión escuchando mensajes', UNSUBSCRIBE: 'solo tiene sentido con SUBSCRIBE',
  PUNSUBSCRIBE: 'solo tiene sentido con SUBSCRIBE', SUNSUBSCRIBE: 'solo tiene sentido con SUBSCRIBE',
  MONITOR: 'deja la conexión recibiendo todo lo que pasa en el servidor', SYNC: 'es para réplicas', PSYNC: 'es para réplicas',
  QUIT: 'cerraría la conexión de la vista', RESET: 'reiniciaría la conexión de la vista',
  SELECT: 'la base se elige con el selector de la vista', HELLO: 'cambia el protocolo de la conexión',
  AUTH: 'la autenticación es la de la conexión guardada',
  MULTI: 'las transacciones no se pueden repartir entre varias líneas', EXEC: 'las transacciones no se pueden repartir entre varias líneas',
  DISCARD: 'las transacciones no se pueden repartir entre varias líneas', WATCH: 'las transacciones no se pueden repartir entre varias líneas',
  UNWATCH: 'las transacciones no se pueden repartir entre varias líneas',
  BLPOP: 'es bloqueante', BRPOP: 'es bloqueante', BRPOPLPUSH: 'es bloqueante', BLMOVE: 'es bloqueante', BLMPOP: 'es bloqueante',
  BZPOPMIN: 'es bloqueante', BZPOPMAX: 'es bloqueante', BZMPOP: 'es bloqueante', WAIT: 'es bloqueante', WAITAOF: 'es bloqueante',
};

/** Comandos (o comando + subcomando) que piden confirmación y quedan auditados. */
const DANGEROUS: Record<string, string> = {
  FLUSHALL: 'borra todas las claves de todas las bases',
  FLUSHDB: 'borra todas las claves de la base',
  SHUTDOWN: 'apaga el servidor de Redis',
  SWAPDB: 'intercambia el contenido de dos bases',
  DEBUG: 'es un comando de depuración que puede bloquear o tumbar el servidor',
  KEYS: 'recorre todas las claves y bloquea el servidor mientras tanto (el buscador usa SCAN)',
  SAVE: 'bloquea el servidor mientras guarda en disco',
  REPLICAOF: 'convierte el servidor en réplica de otro (o la deja de ser)',
  SLAVEOF: 'convierte el servidor en réplica de otro (o la deja de ser)',
  FAILOVER: 'cambia el servidor principal de la réplica',
  MIGRATE: 'mueve claves a otro servidor',
  'CONFIG SET': 'cambia la configuración del servidor',
  'CONFIG REWRITE': 'reescribe el archivo de configuración del servidor',
  'CONFIG RESETSTAT': 'pone a cero las estadísticas del servidor',
  'SCRIPT FLUSH': 'borra los scripts guardados',
  'FUNCTION FLUSH': 'borra todas las funciones',
  'FUNCTION DELETE': 'borra una biblioteca de funciones',
  'FUNCTION RESTORE': 'reemplaza las funciones',
  'ACL SETUSER': 'cambia permisos de usuarios',
  'ACL DELUSER': 'borra usuarios',
  'ACL LOAD': 'recarga los usuarios desde el archivo',
  'ACL SAVE': 'reescribe el archivo de usuarios',
  'CLIENT KILL': 'corta conexiones de otros clientes',
  'CLIENT PAUSE': 'detiene a todos los clientes',
  'CLIENT NO-EVICT': 'cambia cómo se libera memoria',
  'MODULE LOAD': 'carga código en el servidor',
  'MODULE LOADEX': 'carga código en el servidor',
  'MODULE UNLOAD': 'descarga un módulo del servidor',
  'CLUSTER RESET': 'reinicia el nodo del clúster',
  'CLUSTER FAILOVER': 'cambia el nodo principal del clúster',
  'CLUSTER FORGET': 'quita un nodo del clúster',
  'CLUSTER FLUSHSLOTS': 'vacía los slots del nodo',
  'CLUSTER DELSLOTS': 'quita slots del nodo',
  'CLUSTER DELSLOTSRANGE': 'quita slots del nodo',
  'CLUSTER SETSLOT': 'reasigna slots del clúster',
};

export type CommandCheck =
  | { kind: 'ok' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'dangerous'; reason: string };

/** Qué hacer con un comando ya partido en argumentos. */
export function checkCommand(args: string[]): CommandCheck {
  const name = (args[0] ?? '').toUpperCase();
  const sub = (args[1] ?? '').toUpperCase();
  if (BLOCKED[name]) return { kind: 'blocked', reason: BLOCKED[name] };
  /* XREAD / XREADGROUP solo bloquean con la opción BLOCK. */
  if ((name === 'XREAD' || name === 'XREADGROUP') && args.some(a => a.toUpperCase() === 'BLOCK')) {
    return { kind: 'blocked', reason: 'con BLOCK es bloqueante' };
  }
  if (name === 'CLIENT' && sub === 'REPLY') return { kind: 'blocked', reason: 'dejaría la conexión sin respuestas' };
  const reason = DANGEROUS[`${name} ${sub}`] ?? DANGEROUS[name];
  return reason ? { kind: 'dangerous', reason } : { kind: 'ok' };
}
