import { ApiProperty } from '@nestjs/swagger';

export class SSHDiagnosticDto {
  @ApiProperty()
  serverId: string;

  @ApiProperty()
  serverName: string;

  @ApiProperty()
  host: string;

  @ApiProperty()
  port: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  connected: boolean;

  @ApiProperty({ required: false })
  error?: string;

  @ApiProperty({ required: false })
  responseTime?: number;

  @ApiProperty()
  checks: {
    hostReachable: boolean;
    portOpen: boolean;
    sshService: boolean;
    authentication: boolean;
    privateKeyFormat: boolean;
  };

  @ApiProperty({ required: false })
  suggestions?: string[];

  @ApiProperty()
  timestamp: Date;
}
