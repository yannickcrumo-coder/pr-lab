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
import {
  BusquedaDto,
  busquedaDto,
  EjercicioDto,
  ejercicioDto,
  EjercicioParcheDto,
  ejercicioParcheDto,
} from './dto';
import { EjerciciosService } from './ejercicios.service';

@Controller('exercises')
export class EjerciciosController {
  constructor(private readonly ejercicios: EjerciciosService) {}

  @Get()
  buscar(@UsuarioActual() actor: Actor, @Query(new ValidacionZod(busquedaDto)) q: BusquedaDto) {
    return this.ejercicios.buscar(actor.usuarioId, q);
  }

  @Get(':exerciseId')
  ver(@UsuarioActual() actor: Actor, @Param('exerciseId', ParseUUIDPipe) id: string) {
    return this.ejercicios.ver(actor.usuarioId, id);
  }

  @Post()
  crear(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(ejercicioDto)) dto: EjercicioDto) {
    return this.ejercicios.crear(actor.usuarioId, dto);
  }

  @Patch(':exerciseId')
  editar(
    @UsuarioActual() actor: Actor,
    @Param('exerciseId', ParseUUIDPipe) id: string,
    @Body(new ValidacionZod(ejercicioParcheDto)) dto: EjercicioParcheDto,
  ) {
    return this.ejercicios.editar(actor.usuarioId, id, dto);
  }

  /** Archiva. Nunca borra: puede colgar histórico (regla 4). */
  @Delete(':exerciseId')
  @HttpCode(204)
  async archivar(
    @UsuarioActual() actor: Actor,
    @Param('exerciseId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.ejercicios.archivar(actor.usuarioId, id);
  }
}
