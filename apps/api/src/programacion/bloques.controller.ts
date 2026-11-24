import { Controller, Get } from '@nestjs/common';
import { BloquesService } from './bloques.service';

@Controller('catalog')
export class BloquesController {
  constructor(private readonly bloques: BloquesService) {}

  /**
   * Lo que la web del coach necesita para dibujar el menú de tipos de bloque
   * y los formatos de WOD. Es catálogo, igual para todos, sin datos de nadie.
   */
  @Get('blocks')
  bloques_() {
    return this.bloques.catalogoDeBloques();
  }
}
