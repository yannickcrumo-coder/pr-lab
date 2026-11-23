import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Actor, DatosPeticion, Publica, UsuarioActual } from '../comun/decoradores';
import { ValidacionZod } from '../comun/validacion.pipe';
import { AuthService } from './auth.service';
import {
  AccesoDto,
  accesoDto,
  PreferenciasDto,
  preferenciasDto,
  RefrescoDto,
  refrescoDto,
  RegistroDto,
  registroDto,
} from './dto';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publica()
  @Post('auth/register')
  registrar(@Body(new ValidacionZod(registroDto)) dto: RegistroDto, @DatosPeticion() disp: { ip: string; userAgent: string }) {
    return this.auth.registrar(dto, disp);
  }

  @Publica()
  @Post('auth/login')
  @HttpCode(200)
  acceder(@Body(new ValidacionZod(accesoDto)) dto: AccesoDto, @DatosPeticion() disp: { ip: string; userAgent: string }) {
    return this.auth.iniciarSesion(dto, disp);
  }

  @Publica()
  @Post('auth/refresh')
  @HttpCode(200)
  refrescar(@Body(new ValidacionZod(refrescoDto)) dto: RefrescoDto, @DatosPeticion() disp: { ip: string; userAgent: string }) {
    return this.auth.refrescar(dto.refresh_token, disp);
  }

  @Publica()
  @Post('auth/logout')
  @HttpCode(204)
  async salir(@Body(new ValidacionZod(refrescoDto)) dto: RefrescoDto): Promise<void> {
    await this.auth.cerrarSesion(dto.refresh_token);
  }

  @Get('me')
  async yo(@UsuarioActual() actor: Actor) {
    return this.auth.aPublico(await this.auth.exigirUsuario(actor.usuarioId));
  }

  @Patch('me')
  actualizar(@UsuarioActual() actor: Actor, @Body(new ValidacionZod(preferenciasDto)) dto: PreferenciasDto) {
    return this.auth.actualizarPreferencias(actor.usuarioId, dto);
  }
}
