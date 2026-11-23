/**
 * Control de acceso. Es la regla 3 de CLAUDE.md: la autorización se valida en
 * el servidor, por relación activa, y nunca se confía en un id que venga del
 * cliente.
 *
 * Todo módulo que toque datos de un atleta pasa por aquí antes de leer o
 * escribir. Si una ruta nueva no llama a uno de estos métodos, le falta su
 * prueba de acceso indebido.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { Errores } from '../comun/errores';
import {
  coachAtleta,
  perfilesAtleta,
  perfilesCoach,
  type RelacionCoachAtleta,
} from '../db/esquema';

/** Estados en los que la relación todavía existe para efectos de lectura. */
const ESTADOS_VIVOS = ['activa', 'pausada'] as const;

@Injectable()
export class AccesoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * La puerta principal. Devuelve la relación o lanza 403.
   * Ojo: devuelve la relación porque casi todo lo demás cuelga de su id.
   */
  async exigirRelacion(
    coachId: string,
    atletaId: string,
    opciones: { soloActiva?: boolean } = {},
  ): Promise<RelacionCoachAtleta> {
    const estados = opciones.soloActiva ? ['activa'] : [...ESTADOS_VIVOS];

    const [relacion] = await this.db
      .select()
      .from(coachAtleta)
      .where(
        and(
          eq(coachAtleta.coachId, coachId),
          eq(coachAtleta.atletaId, atletaId),
          inArray(coachAtleta.estado, estados),
        ),
      );

    if (!relacion) throw Errores.prohibido('sin_relacion_activa');
    return relacion;
  }

  /** Igual que la anterior, pero a partir del id de la relación. */
  async exigirRelacionPorId(relacionId: string, coachId: string): Promise<RelacionCoachAtleta> {
    const [relacion] = await this.db
      .select()
      .from(coachAtleta)
      .where(and(eq(coachAtleta.id, relacionId), eq(coachAtleta.coachId, coachId)));

    if (!relacion) throw Errores.prohibido('sin_relacion_activa');
    return relacion;
  }

  /** El atleta solo alcanza lo suyo. Sirve para rutas de la app. */
  exigirMismoUsuario(actorId: string, usuarioId: string): void {
    if (actorId !== usuarioId) throw Errores.prohibido('no_es_tuyo');
  }

  /**
   * Acceso a los datos de un atleta: o es él mismo, o es un coach suyo.
   * Devuelve la relación cuando quien pregunta es el coach.
   */
  async exigirAccesoAAtleta(
    actorId: string,
    atletaId: string,
  ): Promise<{ comoAtleta: boolean; relacion: RelacionCoachAtleta | null }> {
    if (actorId === atletaId) return { comoAtleta: true, relacion: null };
    const relacion = await this.exigirRelacion(actorId, atletaId);
    return { comoAtleta: false, relacion };
  }

  async exigirCoach(usuarioId: string): Promise<void> {
    const [perfil] = await this.db
      .select({ id: perfilesCoach.usuarioId })
      .from(perfilesCoach)
      .where(eq(perfilesCoach.usuarioId, usuarioId));
    if (!perfil) throw Errores.prohibido('no_es_coach');
  }

  async exigirAtleta(usuarioId: string): Promise<void> {
    const [perfil] = await this.db
      .select({ id: perfilesAtleta.usuarioId })
      .from(perfilesAtleta)
      .where(eq(perfilesAtleta.usuarioId, usuarioId));
    if (!perfil) throw Errores.prohibido('no_es_atleta');
  }

  /** Los ids de las relaciones vivas de un coach: el filtro de sus consultas. */
  async relacionesDelCoach(coachId: string): Promise<string[]> {
    const filas = await this.db
      .select({ id: coachAtleta.id })
      .from(coachAtleta)
      .where(and(eq(coachAtleta.coachId, coachId), inArray(coachAtleta.estado, [...ESTADOS_VIVOS])));
    return filas.map((f) => f.id);
  }
}
