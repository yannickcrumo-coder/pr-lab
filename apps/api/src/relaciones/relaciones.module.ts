import { Module } from '@nestjs/common';
import { RelacionesController } from './relaciones.controller';
import { RelacionesService } from './relaciones.service';

@Module({
  controllers: [RelacionesController],
  providers: [RelacionesService],
  exports: [RelacionesService],
})
export class RelacionesModule {}
