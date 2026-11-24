import { Module } from '@nestjs/common';
import { EjerciciosModule } from '../ejercicios/ejercicios.module';
import { BloquesController } from './bloques.controller';
import { BloquesService } from './bloques.service';

@Module({
  imports: [EjerciciosModule],
  controllers: [BloquesController],
  providers: [BloquesService],
  exports: [BloquesService],
})
export class ProgramacionModule {}
