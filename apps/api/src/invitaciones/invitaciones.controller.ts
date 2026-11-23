import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
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
  @UsePipes(new ValidacionZod(invitacionDto))
  crear(@UsuarioActual() actor: Actor, @Body() dto: InvitacionDto) {
    return this.invitaciones.crear(actor.usuarioId, dto);
  }

  @Post('accept')
  @HttpCode(200)
  @UsePipes(new ValidacionZod(aceptarInvitacionDto))
  aceptar(@UsuarioActual() actor: Actor, @Body() dto: AceptarInvitacionDto) {
    return this.invitaciones.aceptar(actor.usuarioId, dto.code);
  }
}
