import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { ENTORNO, Entorno } from '../config/entorno';
import { Errores } from '../comun/errores';
import { primeraFila } from '../comun/uno';
import { AccesoService } from '../acceso/acceso.service';
import { coachAtleta, invitaciones } from '../db/esquema';

/** Sin I, O, 0 ni 1: el código se dicta en voz alta en el gimnasio. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class InvitacionesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENTORNO) private readonly env: Entorno,
    private readonly acceso: AccesoService,
  ) {}

  private generarCodigo(largo = 6): string {
    let c = '';
    for (let i = 0; i < largo; i++) c += ALFABETO[randomInt(ALFABETO.length)];
    return c;
  }

  async crear(coachId: string, datos: { email?: string | null; athlete_name?: string | null }) {
    await this.acceso.exigirCoach(coachId);

    const expiraEn = new Date(Date.now() + this.env.INVITACION_TTL_DIAS * 86_400_000);

    // El índice único es parcial sobre las pendientes, así que un choque es
    // posible aunque improbable. Se reintenta en vez de fallarle al coach.
    for (let intento = 0; intento < 5; intento++) {
      const codigo = this.generarCodigo();
      try {
        const inv = primeraFila(
          await this.db
            .insert(invitaciones)
            .values({
              coachId,
              codigo,
              email: datos.email ?? null,
              nombreAtleta: datos.athlete_name ?? null,
              expiraEn,
            })
            .returning(),
          'el alta de la invitación',
        );
        return {
          id: inv.id,
          code: inv.codigo,
          link: `https://app.prlab.app/invitacion/${inv.codigo}`,
          expires_at: inv.expiraEn.toISOString(),
        };
      } catch {
        // choque de código: se reintenta
      }
    }
    throw Errores.conflicto('no_se_pudo_generar_codigo');
  }

  /** Para un usuario que ya tiene cuenta y agrega otro coach. */
  async aceptar(usuarioId: string, codigo: string) {
    const [inv] = await this.db
      .select()
      .from(invitaciones)
      .where(sql`upper(${invitaciones.codigo}) = ${codigo.trim().toUpperCase()}`);

    if (!inv || inv.estado !== 'pendiente') throw Errores.noEncontrado('invitacion_invalida');
    if (inv.expiraEn.getTime() < Date.now()) throw Errores.conflicto('invitacion_vencida');
    if (inv.coachId === usuarioId) throw Errores.conflicto('no_puedes_invitarte');

    const [yaExiste] = await this.db
      .select({ id: coachAtleta.id })
      .from(coachAtleta)
      .where(
        sql`${coachAtleta.coachId} = ${inv.coachId} and ${coachAtleta.atletaId} = ${usuarioId}
            and ${coachAtleta.estado} in ('invitada','activa','pausada')`,
      );
    if (yaExiste) throw Errores.conflicto('ya_son_coach_y_atleta');

    return this.db.transaction(async (tx) => {
      const relacion = primeraFila(
        await tx
          .insert(coachAtleta)
          .values({
            coachId: inv.coachId,
            atletaId: usuarioId,
            estado: 'activa',
            iniciadaEn: new Date(),
          })
          .returning(),
        'el alta de la relación',
      );
      await tx
        .update(invitaciones)
        .set({ estado: 'aceptada', aceptadaPor: usuarioId })
        .where(eq(invitaciones.id, inv.id));
      return { relationship_id: relacion.id, coach_id: inv.coachId };
    });
  }
}
