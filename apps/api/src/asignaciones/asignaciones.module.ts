import { Module } from '@nestjs/common';
import { ProgramacionModule } from '../programacion/programacion.module';
import { AsignacionesController } from './asignaciones.controller';
import { AsignacionesService } from './asignaciones.service';

@Module({
  imports: [ProgramacionModule],
  controllers: [AsignacionesController],
  providers: [AsignacionesService],
  exports: [AsignacionesService],
})
export class AsignacionesModule {}
