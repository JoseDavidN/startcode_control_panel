// src/servers/agent-releases.controller.ts
import {
  Controller,
  Get,
  Header,
  Logger,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import type { Request } from 'express';
import { AgentBinariesService } from './services/agent-binaries.service';
import { AgentInstallTokenGuard } from './guards/agent-install-token.guard';

/**
 * Artefactos que descarga el servidor remoto mientras se instala el agente.
 *
 * Lo llama `curl` desde la máquina monitorizada, autenticado con el token corto
 * de instalación. Va fuera de Swagger porque no es una API para clientes del
 * panel.
 */
@ApiExcludeController()
@Controller('agent-releases')
@UseGuards(AgentInstallTokenGuard)
/* El límite global es de 120 peticiones por minuto y por IP: varios servidores
   tras el mismo NAT instalándose a la vez lo agotarían a mitad de una descarga.
   Quien controla el abuso aquí es el token de cinco minutos. */
@SkipThrottle()
export class AgentReleasesController {
  private readonly logger = new Logger(AgentReleasesController.name);

  constructor(private readonly binaries: AgentBinariesService) {}

  @Get('manifest')
  @Header('Cache-Control', 'no-store')
  getManifest() {
    return this.binaries.getManifest();
  }

  @Get('binary')
  @Header('Content-Type', 'application/octet-stream')
  @Header('Cache-Control', 'no-store')
  getBinary(
    @Query('arch') arch: string,
    @Req() req: Request & { installServerId?: string; res?: any },
  ): StreamableFile {
    const binary = this.binaries.resolve(arch);

    this.logger.log(
      `⬇️  Descarga del agente ${binary.version} (${arch}) para el servidor ${req.installServerId}`,
    );

    /* El sha256 viaja en cabecera además de en el manifest: el instalador lo
       comprueba antes de mover el binario a su sitio. */
    return new StreamableFile(createReadStream(binary.path), {
      length: binary.size,
      disposition: `attachment; filename="${binary.file}"`,
    });
  }

  @Get('install.sh')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getInstaller(): string {
    return this.binaries.getInstallerScript();
  }

  @Get('uninstall.sh')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getUninstaller(): string {
    return this.binaries.getUninstallerScript();
  }
}
