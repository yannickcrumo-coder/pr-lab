import { Inject, Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { ENTORNO, Entorno } from '../config/entorno';
import { Errores } from '../comun/errores';
import {
  coachAtleta,
  intentosAcceso,
  invitaciones,
  perfilesAtleta,
  perfilesCoach,
  usuarios,
  type Usuario,
} from '../db/esquema';
import { DatosDispositivo, ParTokens, TokensService } from './tokens.service';

export interface UsuarioPublico {
  id: string;
  full_name: string;
  email: string;
  locale: string;
  timezone: string;
  units_weight: 'kg' | 'lb';
  units_distance: 'km' | 'mi';
  is_coach: boolean;
  is_athlete: boolean;
}

export interface SesionIniciada extends ParTokens {
  user: UsuarioPublico;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENTORNO) private readonly env: Entorno,
    private readonly tokens: TokensService,
  ) {}

  // ---------------------------------------------------------------- registro
  async registrar(
    datos: {
      email: string;
      password: string;
      full_name: string;
      timezone?: string;
      invitation_code?: string;
    },
    dispositivo: DatosDispositivo = {},
  ): Promise<SesionIniciada> {
    const email = datos.email.trim().toLowerCase();

    const [existente] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${email} and ${usuarios.borradoEn} is null`);
    if (existente) throw Errores.conflicto('email_ya_registrado');

    // Si trae código, se valida ANTES de crear nada.
    const invitacion = datos.invitation_code
      ? await this.buscarInvitacionValida(datos.invitation_code)
      : null;

    const passwordHash = await argonHash(datos.password);

    const usuario = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(usuarios)
        .values({
          email,
          nombre: datos.full_name.trim(),
          passwordHash,
          ...(datos.timezone ? { zonaHoraria: datos.timezone } : {}),
        })
        .returning();

      if (invitacion) {
        // Quien llega con código es atleta de quien lo invitó.
        await tx.insert(perfilesAtleta).values({ usuarioId: u.id });
        await tx.insert(coachAtleta).values({
          coachId: invitacion.coachId,
          atletaId: u.id,
          estado: 'activa',
          iniciadaEn: new Date(),
        });
        await tx
          .update(invitaciones)
          .set({ estado: 'aceptada', aceptadaPor: u.id })
          .where(eq(invitaciones.id, invitacion.id));
      } else {
        await tx.insert(perfilesCoach).values({ usuarioId: u.id });
      }

      return u;
    });

    const par = await this.tokens.emitir(usuario.id, dispositivo);
    return { ...par, user: await this.aPublico(usuario) };
  }

  // ----------------------------------------------------------------- acceso
  async iniciarSesion(
    datos: { email: string; password: string },
    dispositivo: DatosDispositivo = {},
  ): Promise<SesionIniciada> {
    const email = datos.email.trim().toLowerCase();
    await this.exigirIntentosDisponibles(email);

    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${email} and ${usuarios.borradoEn} is null`);

    // Se verifica igual aunque el usuario no exista, para no revelar por el
    // tiempo de respuesta si un correo está registrado o no.
    const hashReferencia =
      usuario?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000';

    let correcta = false;
    try {
      correcta = await argonVerify(hashReferencia, datos.password);
    } catch {
      correcta = false;
    }

    if (!usuario || !usuario.passwordHash || !correcta) {
      await this.registrarIntento(email, dispositivo.ip ?? null, false);
      throw Errores.noAutorizado('credenciales_invalidas');
    }

    await this.registrarIntento(email, dispositivo.ip ?? null, true);
    await this.db
      .update(usuarios)
      .set({ vistoEn: new Date() })
      .where(eq(usuarios.id, usuario.id));

    const par = await this.tokens.emitir(usuario.id, dispositivo);
    return { ...par, user: await this.aPublico(usuario) };
  }

  async refrescar(token: string, dispositivo: DatosDispositivo = {}): Promise<SesionIniciada> {
    const par = await this.tokens.refrescar(token, dispositivo);
    const usuario = await this.exigirUsuario(await this.tokens.verificarAcceso(par.access_token));
    return { ...par, user: await this.aPublico(usuario) };
  }

  async cerrarSesion(token: string): Promise<void> {
    await this.tokens.cerrar(token);
  }

  // ------------------------------------------------------------------ perfil
  async exigirUsuario(id: string): Promise<Usuario> {
    const [u] = await this.db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.id, id), sql`${usuarios.borradoEn} is null`));
    if (!u) throw Errores.noAutorizado('usuario_inexistente');
    return u;
  }

  async aPublico(u: Usuario): Promise<UsuarioPublico> {
    const [coach] = await this.db
      .select({ id: perfilesCoach.usuarioId })
      .from(perfilesCoach)
      .where(eq(perfilesCoach.usuarioId, u.id));
    const [atleta] = await this.db
      .select({ id: perfilesAtleta.usuarioId })
      .from(perfilesAtleta)
      .where(eq(perfilesAtleta.usuarioId, u.id));

    return {
      id: u.id,
      full_name: u.nombre,
      email: u.email,
      locale: u.locale,
      timezone: u.zonaHoraria,
      units_weight: u.unidadPeso,
      units_distance: u.unidadDistancia,
      is_coach: Boolean(coach),
      is_athlete: Boolean(atleta),
    };
  }

  async actualizarPreferencias(
    usuarioId: string,
    cambios: Partial<{
      full_name: string;
      locale: string;
      timezone: string;
      units_weight: 'kg' | 'lb';
      units_distance: 'km' | 'mi';
    }>,
  ): Promise<UsuarioPublico> {
    const [u] = await this.db
      .update(usuarios)
      .set({
        ...(cambios.full_name ? { nombre: cambios.full_name } : {}),
        ...(cambios.locale ? { locale: cambios.locale } : {}),
        ...(cambios.timezone ? { zonaHoraria: cambios.timezone } : {}),
        ...(cambios.units_weight ? { unidadPeso: cambios.units_weight } : {}),
        ...(cambios.units_distance ? { unidadDistancia: cambios.units_distance } : {}),
        actualizadoEn: new Date(),
      })
      .where(eq(usuarios.id, usuarioId))
      .returning();
    return this.aPublico(u);
  }

  // ------------------------------------------------------------- privados
  private async buscarInvitacionValida(codigo: string) {
    const [inv] = await this.db
      .select()
      .from(invitaciones)
      .where(sql`upper(${invitaciones.codigo}) = ${codigo.trim().toUpperCase()}`);

    if (!inv || inv.estado !== 'pendiente') throw Errores.noEncontrado('invitacion_invalida');
    if (inv.expiraEn.getTime() < Date.now()) throw Errores.conflicto('invitacion_vencida');
    return inv;
  }

  private async registrarIntento(email: string, ip: string | null, exitoso: boolean) {
    await this.db.insert(intentosAcceso).values({ email, ip, exitoso });
  }

  /** Frena la fuerza bruta contando fallos recientes del mismo correo. */
  private async exigirIntentosDisponibles(email: string): Promise<void> {
    const desde = new Date(Date.now() - this.env.VENTANA_INTENTOS_MIN * 60_000);
    const [fila] = await this.db
      .select({ n: count() })
      .from(intentosAcceso)
      .where(
        and(
          sql`lower(${intentosAcceso.email}) = ${email}`,
          eq(intentosAcceso.exitoso, false),
          gte(intentosAcceso.creadoEn, desde),
        ),
      );
    if ((fila?.n ?? 0) >= this.env.MAX_INTENTOS_ACCESO) {
      throw Errores.demasiadosIntentos(
        `Espera ${this.env.VENTANA_INTENTOS_MIN} minutos o restablece tu contraseña`,
      );
    }
  }
}
