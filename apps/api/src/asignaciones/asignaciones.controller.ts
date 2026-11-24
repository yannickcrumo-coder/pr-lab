import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, UsuarioActual } from '../comun/decoradores';
import { ValidacionZod } from '../comun/validacion.pipe';
import { AsignacionesService } from './asignaciones.service';
import {
  AsignacionDto,
  asignacionDto,
  AsignacionParcheDto,
  asignacionParcheDto,
  LoteDto,
  loteDto,
  RangoDto,
  rangoDto,
} from './dto';

@Controller()
export class AsignacionesController {
  constructor(private readonly asignaciones: AsignacionesService) {}

  @Post('assignments')
  crear(
    @UsuarioActual() actor: Actor,
    @Body(new ValidacionZod(asignacionDto)) dto: AsignacionDto,
  ) {
    return this.asignaciones.crear(actor.usuarioId, dto);
  }

  @Get('assignments/:assignmentId')
  ver(@UsuarioActual() actor: Actor, @Param('assignmentId', ParseUUIDPipe) id: string) {
    return this.asignaciones.ver(actor.usuarioId, id);
  }

  @Patch('assignments/:assignmentId')
  editar(
    @UsuarioActual() actor: Actor,
    @Param('assignmentId', ParseUUIDPipe) id: string,
    @Body(new ValidacionZod(asignacionParcheDto)) dto: AsignacionParcheDto,
  ) {
    return this.asignaciones.editar(actor.usuarioId, id, dto);
  }

  @Post('assignments/:assignmentId/publish')
  @HttpCode(200)
  publicar(@UsuarioActual() actor: Actor, @Param('assignmentId', ParseUUIDPipe) id: string) {
    return this.asignaciones.publicar(actor.usuarioId, id);
  }

  /** El botón "Publicar cambios" de la web del coach. */
  @Post('assignments:publish-batch')
  @HttpCode(200)
  publicarLote(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(loteDto)) dto: LoteDto) {
    return this.asignaciones.publicarLote(actor.usuarioId, dto.assignment_ids);
  }

  @Delete('assignments/:assignmentId')
  @HttpCode(204)
  async archivar(
    @UsuarioActual() actor: Actor,
    @Param('assignmentId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.asignaciones.archivar(actor.usuarioId, id);
  }

  @Get('athletes/:athleteId/calendar')
  calendario(
    @UsuarioActual() actor: Actor,
    @Param('athleteId', ParseUUIDPipe) atletaId: string,
    @Query(new ValidacionZod(rangoDto)) q: RangoDto,
  ) {
    return this.asignaciones.calendario(actor.usuarioId, atletaId, q.from, q.to);
  }
}
