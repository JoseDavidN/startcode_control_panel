// src/servers/services/agent-binaries.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export type AgentArch = 'amd64' | 'arm64';

export interface AgentManifest {
  version: string;
  builtAt: string;
  binaries: Record<AgentArch, { file: string; sha256: string; size: number }>;
}

export interface AgentBinary {
  path: string;
  file: string;
  sha256: string;
  size: number;
  version: string;
}

/**
 * Los artefactos del agente que el panel sirve a los servidores remotos.
 *
 * Viven en `agent-dist/` y los publica el repositorio del agente con
 * `make release`: ese directorio es todo el contrato entre los dos proyectos.
 * No van en `public/`, que Express sirve sin pasar por guardas, ni en `dist/`,
 * que `nest build` borra entero en cada compilación.
 */
@Injectable()
export class AgentBinariesService implements OnModuleInit {
  private readonly logger = new Logger(AgentBinariesService.name);
  private readonly dir: string;

  private cache: { manifest: AgentManifest; mtimeMs: number } | null = null;
  private scripts = new Map<string, { content: string; mtimeMs: number }>();

  constructor(config: ConfigService) {
    this.dir = config.get<string>(
      'AGENT_DIST_DIR',
      join(process.cwd(), 'agent-dist'),
    );
  }

  onModuleInit(): void {
    if (!existsSync(join(this.dir, 'manifest.json'))) {
      this.logger.warn(
        `⚠️  ${this.dir} no tiene manifest.json — ejecuta 'make release' en el repositorio del agente; la instalación remota fallará hasta entonces.`,
      );
      return;
    }
    const manifest = this.getManifest();
    this.logger.log(`📦 Agente ${manifest.version} listo para instalar`);
  }

  getManifest(): AgentManifest {
    const path = join(this.dir, 'manifest.json');

    if (!existsSync(path)) {
      throw new InternalServerErrorException(
        "El panel no tiene los artefactos del agente. Ejecuta 'make release' en el repositorio del agente.",
      );
    }

    const { mtimeMs } = statSync(path);
    if (this.cache?.mtimeMs === mtimeMs) return this.cache.manifest;

    const manifest = JSON.parse(readFileSync(path, 'utf8')) as AgentManifest;
    this.cache = { manifest, mtimeMs };
    return manifest;
  }

  /** Datos del binario de una arquitectura, o 400/500 con el motivo exacto. */
  resolve(arch: string): AgentBinary {
    if (arch !== 'amd64' && arch !== 'arm64') {
      throw new BadRequestException(
        `Arquitectura "${arch}" no soportada: solo hay binarios para amd64 y arm64.`,
      );
    }

    const manifest = this.getManifest();
    const entry = manifest.binaries[arch];
    const path = entry && join(this.dir, entry.file);

    if (!entry || !existsSync(path)) {
      throw new InternalServerErrorException(
        `El panel no tiene el binario del agente para ${arch}. Ejecuta 'make release' en el repositorio del agente.`,
      );
    }

    return { ...entry, path, version: manifest.version };
  }

  getInstallerScript(): string {
    return this.readScript('install.sh');
  }

  getUninstallerScript(): string {
    return this.readScript('uninstall.sh');
  }

  /** Lee un script cacheado por `mtime`: se publica pocas veces y se lee en cada instalación. */
  private readScript(name: string): string {
    const path = join(this.dir, name);

    if (!existsSync(path)) {
      throw new InternalServerErrorException(
        `Falta ${name} en los artefactos del agente. Ejecuta 'make release' en el repositorio del agente.`,
      );
    }

    const { mtimeMs } = statSync(path);
    const cached = this.scripts.get(name);
    if (cached?.mtimeMs === mtimeMs) return cached.content;

    const content = readFileSync(path, 'utf8');
    this.scripts.set(name, { content, mtimeMs });
    return content;
  }
}
