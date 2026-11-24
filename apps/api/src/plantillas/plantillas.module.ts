import { Module } from '@nestjs/common';
import { ProgramacionModule } from '../programacion/programacion.module';
import { PlantillasController } from './plantillas.controller';
import { PlantillasService } from './plantillas.service';

@Module({
  imports: [ProgramacionModule],
  controllers: [PlantillasController],
  providers: [PlantillasService],
  exports: [PlantillasService],
})
export class PlantillasModule {}
