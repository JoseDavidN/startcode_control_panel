// src/monitoring/dto/agent-payload.ts
/**
 * Guardas de tipo para el campo `data` de los mensajes del agente.
 *
 * Por qué a mano y no con class-validator:
 *
 * - El `ValidationPipe` global (`main.ts`) va con `whitelist` y
 *   `forbidNonWhitelisted`: rechazaría entero a cualquier agente que añada un
 *   campo, que es justo lo que pasa en un despliegue escalonado. El contrato
 *   con el agente es **aditivo**: añadir claves vale, renombrar o cambiar de
 *   tipo exige un `type` de mensaje nuevo.
 * - Un fallo aquí devuelve la ruta exacta (`data.cpu.usage: se esperaba
 *   number, llegó undefined`), que es lo que hace el problema observable.
 * - Se ejecuta cada 30 s por servidor: recorrer a mano es más barato que
 *   `plainToInstance` + `validate` sobre ~160 servicios y N núcleos.
 *
 * Dos niveles: lo que el panel necesita para no guardar basura es obligatorio
 * (y su ausencia invalida el mensaje); el resto es opcional con valor por
 * defecto y no genera incidencia.
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

/* ── Formas normalizadas ──────────────────────────────────────────── */

export interface FilesystemPayload {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  usagePercent: number;
  mount: string;
}

export interface NetworkInterfacePayload {
  iface: string;
  ip4: string;
  ip6: string;
  mac: string;
  operstate: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface TopProcessPayload {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  memVsz: number;
  memRss: number;
  user: string;
  command: string;
}

export interface ProcessesPayload {
  total: number;
  running: number;
  sleeping: number;
  stopped: number;
  zombie: number;
}

export interface SystemInfoPayload {
  hostname: string;
  platform: string;
  distro: string;
  kernel: string;
  arch: string;
  uptime: number;
  bootTime: number;
}

export interface MetricsPayload {
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    usage: number;
    usagePerCore: number[];
    loadAverage: { current: number; avg5: number; avg15: number };
    topProcesses: TopProcessPayload[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    available: number;
    usagePercent: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
    swapUsagePercent: number;
  };
  disk: { filesystems: FilesystemPayload[] };
  network: {
    publicIP: string | null;
    privateIPs: string[];
    connections: { active: number; listening: number };
    interfaces: NetworkInterfacePayload[];
  };
  system: SystemInfoPayload;
  /** Ausente en agentes antiguos: entonces los contadores no se tocan. */
  processes?: ProcessesPayload;
}

export interface ServicePayload {
  name: string;
  displayName: string;
  state: string;
  subState: string;
  enabled: boolean;
  pid: number | null;
  memory: number;
}

export interface ServicesPayload {
  services: ServicePayload[];
  totalActive: number;
  totalInactive: number;
  totalFailed: number;
}

export interface WebsitePayload {
  domain: string;
  port: number;
  ssl: boolean;
  path: string;
  server: string;
  /** ISO-8601. Ausente cuando el agente no pudo leer el certificado. */
  certExpiry?: string;
}

export interface DatabasePayload {
  type: string;
  version: string;
  running: boolean;
  /** Ausente cuando no se pudo medir. Cero sería mentira. */
  sizeBytes?: number;
  /** Ausente cuando el agente no tuvo acceso; `[]` es "acceso y ninguna". */
  databases?: string[];
}

/* ── Primitivas ───────────────────────────────────────────────────── */

const describe = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Obligatorio: anota la ruta y devuelve un valor neutro para poder seguir
 *  recorriendo y reportar todas las incidencias de una vez. */
function reqObj(
  v: unknown,
  path: string,
  issues: string[],
): Record<string, unknown> {
  if (isObj(v)) return v;
  issues.push(`${path}: se esperaba object, llegó ${describe(v)}`);
  return {};
}

function reqNum(v: unknown, path: string, issues: string[]): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  issues.push(`${path}: se esperaba number, llegó ${describe(v)}`);
  return 0;
}

function reqStr(v: unknown, path: string, issues: string[]): string {
  if (typeof v === 'string') return v;
  issues.push(`${path}: se esperaba string, llegó ${describe(v)}`);
  return '';
}

function reqArr(v: unknown, path: string, issues: string[]): unknown[] {
  if (Array.isArray(v)) return v;
  issues.push(`${path}: se esperaba un array, llegó ${describe(v)}`);
  return [];
}

/** Opcional: sin incidencia, con valor por defecto. */
const optNum = (v: unknown, def = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

const optStr = (v: unknown, def = ''): string =>
  typeof v === 'string' ? v : def;

const optBool = (v: unknown, def = false): boolean =>
  typeof v === 'boolean' ? v : def;

const optArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const optNumArr = (v: unknown): number[] =>
  optArr(v).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

const optStrArr = (v: unknown): string[] =>
  optArr(v).filter((s): s is string => typeof s === 'string');

const done = <T>(value: T, issues: string[]): ParseResult<T> =>
  issues.length > 0 ? { ok: false, issues } : { ok: true, value };

/* ── Parsers ──────────────────────────────────────────────────────── */

function filesystem(raw: unknown): FilesystemPayload {
  const f = isObj(raw) ? raw : {};
  return {
    fs: optStr(f.fs),
    type: optStr(f.type),
    size: optNum(f.size),
    used: optNum(f.used),
    available: optNum(f.available),
    usagePercent: optNum(f.usagePercent),
    mount: optStr(f.mount),
  };
}

function networkInterface(raw: unknown): NetworkInterfacePayload {
  const i = isObj(raw) ? raw : {};
  return {
    iface: optStr(i.iface),
    ip4: optStr(i.ip4),
    ip6: optStr(i.ip6),
    mac: optStr(i.mac),
    operstate: optStr(i.operstate),
    rx_bytes: optNum(i.rx_bytes),
    tx_bytes: optNum(i.tx_bytes),
  };
}

function topProcess(raw: unknown): TopProcessPayload {
  const p = isObj(raw) ? raw : {};
  return {
    pid: optNum(p.pid),
    name: optStr(p.name),
    cpu: optNum(p.cpu),
    mem: optNum(p.mem),
    memVsz: optNum(p.memVsz),
    memRss: optNum(p.memRss),
    user: optStr(p.user),
    command: optStr(p.command),
  };
}

function processesSummary(raw: Record<string, unknown>): ProcessesPayload {
  return {
    total: optNum(raw.total),
    running: optNum(raw.running),
    sleeping: optNum(raw.sleeping),
    stopped: optNum(raw.stopped),
    zombie: optNum(raw.zombie),
  };
}

function systemInfo(raw: Record<string, unknown>): SystemInfoPayload {
  return {
    hostname: optStr(raw.hostname),
    platform: optStr(raw.platform),
    distro: optStr(raw.distro),
    kernel: optStr(raw.kernel),
    arch: optStr(raw.arch),
    uptime: optNum(raw.uptime),
    bootTime: optNum(raw.bootTime),
  };
}

export function parseMetrics(data: unknown): ParseResult<MetricsPayload> {
  const issues: string[] = [];
  const d = reqObj(data, 'data', issues);

  const cpu = reqObj(d.cpu, 'data.cpu', issues);
  const memory = reqObj(d.memory, 'data.memory', issues);
  const disk = reqObj(d.disk, 'data.disk', issues);
  const network = isObj(d.network) ? d.network : {};
  const system = reqObj(d.system, 'data.system', issues);
  const load = isObj(cpu.loadAverage) ? cpu.loadAverage : {};
  const connections = isObj(network.connections) ? network.connections : {};

  /* Núcleo obligatorio: sin esto, guardar la fila sería guardar ruido. */
  const usage = reqNum(cpu.usage, 'data.cpu.usage', issues);
  const memTotal = reqNum(memory.total, 'data.memory.total', issues);
  const memPercent = reqNum(
    memory.usagePercent,
    'data.memory.usagePercent',
    issues,
  );
  const filesystems = reqArr(
    disk.filesystems,
    'data.disk.filesystems',
    issues,
  ).map(filesystem);
  const hostname = reqStr(system.hostname, 'data.system.hostname', issues);

  const value: MetricsPayload = {
    cpu: {
      manufacturer: optStr(cpu.manufacturer),
      brand: optStr(cpu.brand),
      cores: optNum(cpu.cores),
      physicalCores: optNum(cpu.physicalCores),
      usage,
      usagePerCore: optNumArr(cpu.usagePerCore),
      loadAverage: {
        current: optNum(load.current),
        avg5: optNum(load.avg5),
        avg15: optNum(load.avg15),
      },
      topProcesses: optArr(cpu.topProcesses).map(topProcess),
    },
    memory: {
      total: memTotal,
      used: optNum(memory.used),
      free: optNum(memory.free),
      available: optNum(memory.available),
      usagePercent: memPercent,
      swapTotal: optNum(memory.swapTotal),
      swapUsed: optNum(memory.swapUsed),
      swapFree: optNum(memory.swapFree),
      swapUsagePercent: optNum(memory.swapUsagePercent),
    },
    disk: { filesystems },
    network: {
      publicIP: optStr(network.publicIP) || null,
      privateIPs: optStrArr(network.privateIPs),
      connections: {
        active: optNum(connections.active),
        listening: optNum(connections.listening),
      },
      interfaces: optArr(network.interfaces).map(networkInterface),
    },
    system: { ...systemInfo(system), hostname },
    ...(isObj(d.processes) ? { processes: processesSummary(d.processes) } : {}),
  };

  return done(value, issues);
}

export function parseSystemInfo(data: unknown): ParseResult<SystemInfoPayload> {
  const issues: string[] = [];
  const d = reqObj(data, 'data', issues);
  const hostname = reqStr(d.hostname, 'data.hostname', issues);
  return done({ ...systemInfo(d), hostname }, issues);
}

export function parseProcessesInventory(
  data: unknown,
): ParseResult<ProcessesPayload> {
  const issues: string[] = [];
  const d = reqObj(data, 'data', issues);
  const total = reqNum(d.total, 'data.total', issues);
  return done({ ...processesSummary(d), total }, issues);
}

export function parseServicesInventory(
  data: unknown,
): ParseResult<ServicesPayload> {
  const issues: string[] = [];

  /* El agente manda `{services: [...]}`; se admite el array suelto por si
     algún emisor antiguo lo envía así. */
  const d = Array.isArray(data) ? { services: data } : reqObj(data, 'data', issues);
  const raw = reqArr(d.services, 'data.services', issues);

  const services: ServicePayload[] = raw.map((item, i) => {
    const s = isObj(item) ? item : {};
    const name = reqStr(s.name, `data.services[${i}].name`, issues);
    const pid = optNum(s.pid, 0);
    return {
      name,
      displayName: optStr(s.displayName),
      state: optStr(s.state, 'unknown'),
      subState: optStr(s.subState),
      enabled: optBool(s.enabled),
      /* `cpuPercent` ya no se guarda: systemd no lo reporta por unidad y
         siempre llegaba en 0. */
      pid: pid > 0 ? pid : null,
      memory: optNum(s.memory),
    };
  });

  const counted = (state: string) =>
    services.filter((s) => s.state === state).length;

  return done(
    {
      services,
      totalActive: optNum(d.totalActive, counted('active')),
      totalInactive: optNum(d.totalInactive, counted('inactive')),
      totalFailed: optNum(d.totalFailed, counted('failed')),
    },
    issues,
  );
}

export function parseWebsitesInventory(
  data: unknown,
): ParseResult<WebsitePayload[]> {
  const issues: string[] = [];
  const raw = reqArr(data, 'data', issues);

  const websites = raw.map((item, i) => {
    const w = isObj(item) ? item : {};
    const domain = reqStr(w.domain, `data[${i}].domain`, issues);
    const certExpiry = optStr(w.certExpiry);
    return {
      domain,
      port: optNum(w.port),
      ssl: optBool(w.ssl),
      path: optStr(w.path),
      server: optStr(w.server),
      ...(certExpiry ? { certExpiry } : {}),
    };
  });

  return done(websites, issues);
}

export function parseDatabasesInventory(
  data: unknown,
): ParseResult<DatabasePayload[]> {
  const issues: string[] = [];
  const raw = reqArr(data, 'data', issues);

  const databases = raw.map((item, i) => {
    const db = isObj(item) ? item : {};
    const type = reqStr(db.type, `data[${i}].type`, issues);
    const sizeBytes =
      typeof db.sizeBytes === 'number' && Number.isFinite(db.sizeBytes)
        ? db.sizeBytes
        : undefined;
    return {
      type,
      version: optStr(db.version),
      running: optBool(db.running),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      ...(Array.isArray(db.databases)
        ? { databases: optStrArr(db.databases) }
        : {}),
    };
  });

  return done(databases, issues);
}
