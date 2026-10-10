import { Global, Module } from '@nestjs/common';
import { CloudConfig } from '@/common/cloud-config';
import { StateStore } from './state.store';

/** Configuración y estado compartidos por todos los módulos. */
@Global()
@Module({
  providers: [CloudConfig, StateStore],
  exports: [CloudConfig, StateStore],
})
export class StateModule {}
