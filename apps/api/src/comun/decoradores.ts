/** Saca del request al usuario que el guardia ya autenticó. */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface Actor {
  usuarioId: string;
}

export const SIN_AUTENTICAR = 'sin_autenticar';
/** Marca una ruta como pública. Todo lo demás exige token. */
export const Publica = () => SetMetadata(SIN_AUTENTICAR, true);

export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest().actor,
);

export const DatosPeticion = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return {
    ip: req.ip ?? null,
    userAgent: req.headers?.['user-agent'] ?? null,
  };
});
