import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Actor, UsuarioActual } from '../comun/decoradores';
import { RelacionesService } from './relaciones.service';

@Controller()
export class RelacionesController {
  constructor(private readonly relaciones: RelacionesService) {}

  @Get('athletes')
  misAtletas(@UsuarioActual() actor: Actor, @Query('status') estado?: string) {
    return this.relaciones.misAtletas(actor.usuarioId, estado);
  }

  @Get('athletes/:athleteId')
  verAtleta(
    @UsuarioActual() actor: Actor,
    @Param('athleteId', new ParseUUIDPipe()) atletaId: string,
  ) {
    return this.relaciones.verAtleta(actor.usuarioId, atletaId);
  }

  @Delete('athletes/:athleteId')
  @HttpCode(204)
  async archivar(
    @UsuarioActual() actor: Actor,
    @Param('athleteId', new ParseUUIDPipe()) atletaId: string,
  ): Promise<void> {
    await this.relaciones.archivar(actor.usuarioId, atletaId);
  }

  @Get('coaches')
  misCoaches(@UsuarioActual() actor: Actor) {
    return this.relaciones.misCoaches(actor.usuarioId);
  }
}
