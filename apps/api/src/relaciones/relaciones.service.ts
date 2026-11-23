import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { AccesoService } from '../acceso/acceso.service';
import { coachAtleta, perfilesCoach, usuarios } from '../db/esquema';

export interface AtletaResumen {
  id: string;
  full_name: string;
  relationship_id: string;
  status: string;
  last_session_at: string | null;
}

@Injectable()
export class RelacionesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly acceso: AccesoService,
  ) {}

  /** Los atletas del coach. Nunca devuelve los de otro coach. */
  async misAtletas(coachId: string, estado?: string) {
    await this.acceso.exigirCoach(coachId);

    const estados = estado ? [estado] : ['invitada', 'activa', 'pausada'];

    const filas = await this.db
      .select({
        id: usuarios.id,
        full_name: usuarios.nombre,
        relationship_id: coachAtleta.id,
        status: coachAtleta.estado,
        last_session_at: usuarios.vistoEn,
      })
      .from(coachAtleta)
      .innerJoin(usuarios, eq(usuarios.id, coachAtleta.atletaId))
      .where(and(eq(coachAtleta.coachId, coachId), inArray(coachAtleta.estado, estados)))
      .orderBy(desc(coachAtleta.creadaEn));

    return {
      data: filas.map((f) => ({
        ...f,
        last_session_at: f.last_session_at?.toISOString() ?? null,
      })),
      counts: await this.conteos(coachId),
    };
  }

  /** La base del modelo de cobro: 20 incluidos, de ahí paquetes de 50. */
  async conteos(coachId: string) {
    const [activos] = await this.db
      .select({ n: count() })
      .from(coachAtleta)
      .where(and(eq(coachAtleta.coachId, coachId), eq(coachAtleta.estado, 'activa')));
    const [invitados] = await this.db
      .select({ n: count() })
      .from(coachAtleta)
      .where(and(eq(coachAtleta.coachId, coachId), eq(coachAtleta.estado, 'invitada')));
    const [perfil] = await this.db
      .select({ incluidos: perfilesCoach.atletasIncluidos })
      .from(perfilesCoach)
      .where(eq(perfilesCoach.usuarioId, coachId));

    return {
      activos: activos?.n ?? 0,
      invitados: invitados?.n ?? 0,
      incluidos: perfil?.incluidos ?? 20,
    };
  }

  /** Ficha de un atleta. Pasa por el control de acceso antes de leer nada. */
  async verAtleta(coachId: string, atletaId: string) {
    const relacion = await this.acceso.exigirRelacion(coachId, atletaId);
    const [u] = await this.db
      .select({ id: usuarios.id, full_name: usuarios.nombre, timezone: usuarios.zonaHoraria })
      .from(usuarios)
      .where(eq(usuarios.id, atletaId));

    return {
      ...u,
      relationship_id: relacion.id,
      status: relacion.estado,
      coach_notes: relacion.notasCoach,
    };
  }

  /** Los coaches del atleta. Cada uno ve solo su propia relación. */
  async misCoaches(atletaId: string) {
    const filas = await this.db
      .select({
        id: usuarios.id,
        full_name: usuarios.nombre,
        relationship_id: coachAtleta.id,
        status: coachAtleta.estado,
      })
      .from(coachAtleta)
      .innerJoin(usuarios, eq(usuarios.id, coachAtleta.coachId))
      .where(and(eq(coachAtleta.atletaId, atletaId), inArray(coachAtleta.estado, ['activa', 'pausada'])));
    return { data: filas };
  }

  /** Archivar conserva el histórico; nunca se borra. */
  async archivar(coachId: string, atletaId: string) {
    const relacion = await this.acceso.exigirRelacion(coachId, atletaId);
    await this.db
      .update(coachAtleta)
      .set({ estado: 'archivada', terminadaEn: new Date(), actualizadaEn: new Date() })
      .where(eq(coachAtleta.id, relacion.id));
  }
}
