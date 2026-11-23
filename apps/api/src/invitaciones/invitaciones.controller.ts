import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Actor, UsuarioActual } from '../comun/decoradores';
import { ValidacionZod } from '../comun/validacion.pipe';
import {
  AceptarInvitacionDto,
  aceptarInvitacionDto,
  InvitacionDto,
  invitacionDto,
} from '../auth/dto';
import { InvitacionesService } from './invitaciones.service';

@Controller('invitations')
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post()
  crear(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(invitacionDto)) dto: InvitacionDto) {
    return this.invitaciones.crear(actor.usuarioId, dto);
  }

  @Post('accept')
  @HttpCode(200)
  aceptar(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(aceptarInvitacionDto)) dto: AceptarInvitacionDto) {
    return this.invitaciones.aceptar(actor.usuarioId, dto.code);
  }
}
