import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errores } from '../comun/errores';
import { SIN_AUTENTICAR } from '../comun/decoradores';
import { TokensService } from './tokens.service';

/**
 * Guardia global: toda ruta exige token salvo las marcadas con @Publica().
 * Se prefiere que falle por omisión antes que por olvido.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(SIN_AUTENTICAR, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publica) return true;

    const req = ctx.switchToHttp().getRequest();
    const encabezado: string | undefined = req.headers?.authorization;
    if (!encabezado?.startsWith('Bearer ')) throw Errores.noAutorizado('falta_token');

    const usuarioId = await this.tokens.verificarAcceso(encabezado.slice(7).trim());
    req.actor = { usuarioId };
    return true;
  }
}
