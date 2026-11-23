/**
 * Tokens de acceso y de refresco.
 *
 * El de acceso es un JWT corto que no se guarda en ningún lado. El de refresco
 * es un valor aleatorio del que solo guardamos su huella, y **rota en cada
 * uso**: el anterior queda marcado como usado.
 *
 * Si alguien presenta un token de refresco que ya se usó, es que se lo robaron
 * (el dueño legítimo ya lo cambió), así que revocamos la familia entera y
 * obligamos a volver a iniciar sesión.
 */
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { sesiones } from '../db/esquema';
import { ENTORNO, Entorno } from '../config/entorno';
import { Errores } from '../comun/errores';

export interface ParTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DatosDispositivo {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENTORNO) private readonly env: Entorno,
    private readonly jwt: JwtService,
  ) {}

  private huella(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async emitir(
    usuarioId: string,
    dispositivo: DatosDispositivo = {},
    familiaId = randomUUID(),
  ): Promise<ParTokens> {
    const access = await this.jwt.signAsync(
      { sub: usuarioId, typ: 'acceso' },
      { expiresIn: this.env.JWT_ACCESS_TTL },
    );

    const refresh = randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000);

    await this.db.insert(sesiones).values({
      usuarioId,
      tokenHash: this.huella(refresh),
      familiaId,
      ip: dispositivo.ip ?? null,
      userAgent: dispositivo.userAgent ?? null,
      expiraEn,
    });

    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: this.env.JWT_ACCESS_TTL,
    };
  }

  async verificarAcceso(token: string): Promise<string> {
    try {
      const carga = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token);
      if (carga.typ !== 'acceso') throw new Error('tipo incorrecto');
      return carga.sub;
    } catch {
      throw Errores.noAutorizado('token_invalido');
    }
  }

  /** Rota el token de refresco y detecta reúso. */
  async refrescar(token: string, dispositivo: DatosDispositivo = {}): Promise<ParTokens> {
    const hash = this.huella(token);
    const [sesion] = await this.db.select().from(sesiones).where(eq(sesiones.tokenHash, hash));

    if (!sesion) throw Errores.noAutorizado('refresco_invalido');

    if (sesion.usadaEn || sesion.revocadaEn) {
      // Reúso: el dueño legítimo ya rotó este token. Cerramos toda la familia.
      await this.revocarFamilia(sesion.familiaId);
      throw Errores.noAutorizado('refresco_reusado', 'Se cerraron las sesiones por seguridad');
    }

    if (sesion.expiraEn.getTime() < Date.now()) {
      throw Errores.noAutorizado('refresco_vencido');
    }

    const nuevos = await this.emitir(sesion.usuarioId, dispositivo, sesion.familiaId);
    const [nueva] = await this.db
      .select({ id: sesiones.id })
      .from(sesiones)
      .where(eq(sesiones.tokenHash, this.huella(nuevos.refresh_token)));

    await this.db
      .update(sesiones)
      .set({ usadaEn: new Date(), reemplazadaPor: nueva?.id ?? null })
      .where(eq(sesiones.id, sesion.id));

    return nuevos;
  }

  async cerrar(token: string): Promise<void> {
    await this.db
      .update(sesiones)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesiones.tokenHash, this.huella(token)), isNull(sesiones.revocadaEn)));
  }

  async revocarFamilia(familiaId: string): Promise<void> {
    await this.db
      .update(sesiones)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesiones.familiaId, familiaId), isNull(sesiones.revocadaEn)));
  }

  async revocarTodasDe(usuarioId: string): Promise<void> {
    await this.db
      .update(sesiones)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesiones.usuarioId, usuarioId), isNull(sesiones.revocadaEn)));
  }
}
