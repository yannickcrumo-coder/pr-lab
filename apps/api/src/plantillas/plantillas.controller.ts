import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Actor, UsuarioActual } from '../comun/decoradores';
import { ValidacionZod } from '../comun/validacion.pipe';
import {
  ListadoPlantillasDto,
  listadoPlantillasDto,
  PlantillaDto,
  plantillaDto,
} from './dto';
import { PlantillasService } from './plantillas.service';

@Controller('templates')
export class PlantillasController {
  constructor(private readonly plantillas: PlantillasService) {}

  @Get()
  mias(
    @UsuarioActual() actor: Actor,
    @Query(new ValidacionZod(listadoPlantillasDto)) q: ListadoPlantillasDto,
  ) {
    return this.plantillas.mias(actor.usuarioId, q);
  }

  @Get(':templateId')
  ver(@UsuarioActual() actor: Actor, @Param('templateId', ParseUUIDPipe) id: string) {
    return this.plantillas.ver(actor.usuarioId, id);
  }

  @Post()
  crear(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(plantillaDto)) dto: PlantillaDto) {
    return this.plantillas.crear(actor.usuarioId, dto);
  }

  @Put(':templateId')
  reemplazar(
    @UsuarioActual() actor: Actor,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(new ValidacionZod(plantillaDto)) dto: PlantillaDto,
  ) {
    return this.plantillas.reemplazar(actor.usuarioId, id, dto);
  }

  @Delete(':templateId')
  @HttpCode(204)
  async archivar(
    @UsuarioActual() actor: Actor,
    @Param('templateId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.plantillas.archivar(actor.usuarioId, id);
  }
}
