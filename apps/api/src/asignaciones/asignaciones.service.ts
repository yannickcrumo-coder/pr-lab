/**
 * Asignaciones: la sesión de un día para un atleta. Es el corazón del
 * producto y donde vive la regla 1.
 *
 * ASIGNAR ES COPIAR, NO APUNTAR
 * -----------------------------
 * Cuando una asignación nace de una plantilla, el servidor copia sus bloques
 * y sus ítems a `assignment_blocks` y `assignment_items`. No guarda una
 * referencia. `source_template_id` queda, pero solo para saber de dónde
 * salió: la copia ya es independiente.
 *
 * Por qué importa tanto: un coach cambia su plantilla de fuerza en marzo y
 * eso no puede alterar lo que un atleta ya entrenó en enero. El histórico
 * tiene que seguir diciendo lo que de verdad se prescribió ese día, no lo que
 * la plantilla dice hoy. Si esto se rompiera, el progreso del atleta quedaría
 * comparando contra prescripciones que nunca existieron.
 *
 * Lo mismo aplica al revés: editar una asignación no toca la plantilla.
 *
 * MULTI-INQUILINO
 * ---------------
 * La asignación cuelga de `coach_athlete_id`, de la RELACIÓN, no del atleta.
 * Eso es lo que hace que dos coaches del mismo atleta no se vean entre sí
 * incluso si alguien olvida un filtro: no hay forma de llegar a la asignación
 * del otro coach sin pasar por su relación.
 *
 * BORRADOR Y PUBLICAR
 * -------------------
 * Nace en `borrador` y el atleta no la ve. `publicar` es el paso que la hace
 * visible, pone `published_at` y dispara la notificación. El coach puede
 * armar la semana completa y publicarla de un golpe.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AccesoService } from '../acceso/acceso.service';
import { Errores } from '../comun/errores';
import { etiquetaDeItem, letraDeBloque } from '../comun/etiquetas';
import { primeraFila } from '../comun/uno';
import { catalogo } from '../db/catalogo';
import { DB, type Db } from '../db/db.module';
import { usuarios } from '../db/esquema';
import type { BloqueDto } from '../programacion/bloques.dto';
import { BloquesService } from '../programacion/bloques.service';

const {
  asignaciones,
  bloquesAsignacion,
  bloquesPlantilla,
  itemsAsignacion,
  itemsPlantilla,
  plantillas,
} = catalogo;

type Transaccion = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AsignacionEntrada {
  athlete_id: string;
  scheduled_date: string;
  title: string;
  discipline?: string | null;
  cycle_id?: string | null;
  template_id?: string | null;
  blocks?: BloqueDto[];
}

export interface AsignacionParche {
  title?: string;
  discipline?: string | null;
  scheduled_date?: string;
  coach_note?: string | null;
  blocks?: BloqueDto[];
}

@Injectable()
export class AsignacionesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly acceso: AccesoService,
    private readonly bloques: BloquesService,
  ) {}

  // ------------------------------------------------------------------ crear

  async crear(coachId: string, datos: AsignacionEntrada) {
    // La relación tiene que estar activa: a un atleta pausado no se le
    // programa, y a uno archivado menos.
    const relacion = await this.acceso.exigirRelacion(coachId, datos.athlete_id, {
      soloActiva: true,
    });

    // La fecha es la LOCAL del atleta, y se guarda con la zona con que se
    // calculó. Si el atleta se muda de zona después, lo ya programado sigue
    // cayendo en el día que el coach quiso.
    const zona = await this.zonaDelAtleta(datos.athlete_id);

    const desdePlantilla = datos.template_id
      ? await this.bloquesDePlantilla(coachId, datos.template_id)
      : null;

    // Si vienen bloques en el cuerpo, esos ganan: el coach armó la sesión a
    // mano. Si no, se copia la plantilla.
    const entrada = datos.blocks ?? desdePlantilla ?? [];
    const validados = await this.bloques.validar(coachId, entrada);

    const id = await this.db.transaction(async (tx) => {
      const asignacion = primeraFila(
        await tx
          .insert(asignaciones)
          .values({
            coachAtletaId: relacion.id,
            ...(datos.cycle_id ? { cicloId: datos.cycle_id } : {}),
            ...(datos.template_id ? { plantillaOrigenId: datos.template_id } : {}),
            titulo: datos.title.trim(),
            ...(datos.discipline ? { disciplina: datos.discipline } : {}),
            fecha: datos.scheduled_date,
            zonaHorariaAtleta: zona,
            estado: 'borrador',
          })
          .returning({ id: asignaciones.id }),
        'el alta de la asignación',
      );

      await this.escribirBloques(tx, asignacion.id, validados);
      return asignacion.id;
    });

    return this.ver(coachId, id);
  }

  /**
   * Lee los bloques de una plantilla y los devuelve en forma de entrada, listos
   * para copiarse. Es la mitad de la regla 1: de aquí en adelante nadie
   * vuelve a mirar la plantilla.
   */
  private async bloquesDePlantilla(coachId: string, plantillaId: string): Promise<BloqueDto[]> {
    const [plantilla] = await this.db
      .select({ id: plantillas.id, coachId: plantillas.coachId })
      .from(plantillas)
      .where(eq(plantillas.id, plantillaId))
      .limit(1);

    if (!plantilla || plantilla.coachId !== coachId) {
      throw Errores.noEncontrado('plantilla');
    }

    const bloques = await this.db
      .select()
      .from(bloquesPlantilla)
      .where(eq(bloquesPlantilla.plantillaId, plantillaId))
      .orderBy(asc(bloquesPlantilla.diaOffset), asc(bloquesPlantilla.posicion));

    if (bloques.length === 0) return [];

    const items = await this.db
      .select()
      .from(itemsPlantilla)
      .where(
        inArray(
          itemsPlantilla.bloqueId,
          bloques.map((b) => b.id),
        ),
      )
      .orderBy(asc(itemsPlantilla.posicion));

    const porBloque = new Map<string, typeof items>();
    for (const it of items) {
      const lista = porBloque.get(it.bloqueId) ?? [];
      lista.push(it);
      porBloque.set(it.bloqueId, lista);
    }

    return bloques.map((b) => ({
      position: b.posicion,
      block_type: b.tipoBloque,
      title: b.titulo,
      body_text: b.textoLibre,
      wod_format: b.formatoWod,
      config: b.config as Record<string, unknown>,
      items: (porBloque.get(b.id) ?? []).map((i) => ({
        position: i.posicion,
        exercise_id: i.ejercicioId,
        prescription: i.prescripcion as Record<string, unknown>,
        notes: i.notas,
        superset_key: i.supersetKey,
      })),
    }));
  }

  // ----------------------------------------------------------------- editar

  async editar(coachId: string, asignacionId: string, cambios: AsignacionParche) {
    const asignacion = await this.exigirMia(coachId, asignacionId);

    const validados =
      cambios.blocks === undefined ? null : await this.bloques.validar(coachId, cambios.blocks);

    await this.db.transaction(async (tx) => {
      await tx
        .update(asignaciones)
        .set({
          ...(cambios.title ? { titulo: cambios.title.trim() } : {}),
          ...(cambios.discipline !== undefined ? { disciplina: cambios.discipline } : {}),
          ...(cambios.scheduled_date ? { fecha: cambios.scheduled_date } : {}),
          ...(cambios.coach_note !== undefined ? { notaCoach: cambios.coach_note } : {}),
          // Si ya estaba publicada, el cambio sube la versión. El cliente usa
          // la versión para saber que lo que tiene en el teléfono quedó viejo.
          ...(asignacion.estado !== 'borrador' ? { version: asignacion.version + 1 } : {}),
          actualizadoEn: new Date(),
        })
        .where(eq(asignaciones.id, asignacionId));

      if (validados !== null) {
        await tx
          .delete(bloquesAsignacion)
          .where(eq(bloquesAsignacion.asignacionId, asignacionId));
        await this.escribirBloques(tx, asignacionId, validados);
      }
    });

    return this.ver(coachId, asignacionId);
  }

  /**
   * Publicar: el paso que hace visible la sesión.
   *
   * Es idempotente a propósito. El botón "Publicar cambios" de la web manda
   * la lista completa de la semana, y volver a publicar algo ya publicado no
   * debe ser un error ni mover `published_at`.
   */
  async publicar(coachId: string, asignacionId: string) {
    const asignacion = await this.exigirMia(coachId, asignacionId);

    if (asignacion.estado === 'borrador') {
      const tiene = await this.tieneContenido(asignacionId);
      if (!tiene) {
        throw Errores.noProcesable([{ field: 'blocks', code: 'vacia' }]);
      }
      await this.db
        .update(asignaciones)
        .set({
          estado: 'publicada',
          publicadaEn: new Date(),
          syncSeq: sql`nextval('sync_seq_global')`,
          actualizadoEn: new Date(),
        })
        .where(eq(asignaciones.id, asignacionId));
    }

    return this.ver(coachId, asignacionId);
  }

  /**
   * Publicar varias. Devuelve el resultado por sesión en lugar de fallar
   * completo: si una de treinta está vacía, el coach quiere que las otras
   * veintinueve salgan y saber cuál falló.
   */
  async publicarLote(coachId: string, ids: string[]) {
    const fallidas: { id: string; code: string }[] = [];
    let publicadas = 0;

    for (const id of ids) {
      try {
        await this.publicar(coachId, id);
        publicadas++;
      } catch (e) {
        const code =
          e && typeof e === 'object' && 'code' in e && typeof e.code === 'string'
            ? e.code
            : 'error';
        fallidas.push({ id, code });
      }
    }

    return { published: publicadas, failed: fallidas };
  }

  /** Archiva (regla 4): si el atleta registró algo, ese registro se queda. */
  async archivar(coachId: string, asignacionId: string): Promise<void> {
    await this.exigirMia(coachId, asignacionId);
    await this.db
      .update(asignaciones)
      .set({
        archivadaEn: new Date(),
        syncSeq: sql`nextval('sync_seq_global')`,
        actualizadoEn: new Date(),
      })
      .where(eq(asignaciones.id, asignacionId));
  }

  // -------------------------------------------------------------- consultar

  async ver(usuarioId: string, asignacionId: string) {
    const asignacion = await this.exigirVisible(usuarioId, asignacionId);

    const bloques = await this.db
      .select()
      .from(bloquesAsignacion)
      .where(eq(bloquesAsignacion.asignacionId, asignacionId))
      .orderBy(asc(bloquesAsignacion.posicion));

    const items =
      bloques.length === 0
        ? []
        : await this.db
            .select()
            .from(itemsAsignacion)
            .where(
              inArray(
                itemsAsignacion.bloqueId,
                bloques.map((b) => b.id),
              ),
            )
            .orderBy(asc(itemsAsignacion.posicion));

    const porBloque = new Map<string, typeof items>();
    for (const it of items) {
      const lista = porBloque.get(it.bloqueId) ?? [];
      lista.push(it);
      porBloque.set(it.bloqueId, lista);
    }

    return {
      id: asignacion.id,
      title: asignacion.titulo,
      discipline: asignacion.disciplina,
      scheduled_date: asignacion.fecha,
      athlete_timezone: asignacion.zonaHorariaAtleta,
      status: asignacion.estado,
      version: asignacion.version,
      coach_note: asignacion.notaCoach,
      source_template_id: asignacion.plantillaOrigenId,
      cycle_id: asignacion.cicloId,
      published_at: asignacion.publicadaEn?.toISOString() ?? null,
      sync_seq: asignacion.syncSeq,
      // `label` va calculado, no guardado: ver comun/etiquetas.ts.
      blocks: bloques.map((b, bi) => ({
        id: b.id,
        label: letraDeBloque(bi),
        position: b.posicion,
        block_type: b.tipoBloque,
        title: b.titulo,
        body_text: b.textoLibre,
        wod_format: b.formatoWod,
        config: b.config,
        items: (porBloque.get(b.id) ?? []).map((i, ii) => ({
          id: i.id,
          label: etiquetaDeItem(bi, ii),
          position: i.posicion,
          exercise_id: i.ejercicioId,
          prescription: i.prescripcion,
          notes: i.notas,
          superset_key: i.supersetKey,
        })),
      })),
    };
  }

  /**
   * El calendario de un atleta en un rango. Lo pide la web del coach para
   * pintar la semana y la app del atleta para su propio plan.
   *
   * El coach ve también los borradores, porque son suyos. El atleta solo ve
   * lo publicado: un borrador en su teléfono sería una sesión que el coach
   * todavía está pensando.
   */
  async calendario(
    usuarioId: string,
    atletaId: string,
    desde: string,
    hasta: string,
  ) {
    const { comoAtleta, relacion } = await this.acceso.exigirAccesoAAtleta(usuarioId, atletaId);

    const condiciones = [
      between(asignaciones.fecha, desde, hasta),
      isNull(asignaciones.archivadaEn),
    ];

    if (comoAtleta) {
      // Todas sus relaciones vivas: el atleta ve su día completo, de todos
      // sus coaches, sin saber de quién viene cada sesión.
      const relaciones = await this.acceso.relacionesDelAtleta(atletaId);
      if (relaciones.length === 0) return { data: [] };
      condiciones.push(inArray(asignaciones.coachAtletaId, relaciones));
      condiciones.push(inArray(asignaciones.estado, ['publicada', 'completada', 'parcial', 'omitida']));
    } else {
      // Solo la relación de ESTE coach: nunca las sesiones de otro coach del
      // mismo atleta.
      condiciones.push(eq(asignaciones.coachAtletaId, relacion!.id));
    }

    const filas = await this.db
      .select({
        id: asignaciones.id,
        titulo: asignaciones.titulo,
        disciplina: asignaciones.disciplina,
        fecha: asignaciones.fecha,
        estado: asignaciones.estado,
        version: asignaciones.version,
        syncSeq: asignaciones.syncSeq,
      })
      .from(asignaciones)
      .where(and(...condiciones))
      .orderBy(asc(asignaciones.fecha));

    return {
      data: filas.map((a) => ({
        id: a.id,
        title: a.titulo,
        discipline: a.disciplina,
        scheduled_date: a.fecha,
        status: a.estado,
        version: a.version,
        sync_seq: a.syncSeq,
      })),
    };
  }

  // ---------------------------------------------------------------- comunes

  private async escribirBloques(
    tx: Transaccion,
    asignacionId: string,
    bloques: Awaited<ReturnType<BloquesService['validar']>>,
  ): Promise<void> {
    for (const b of bloques) {
      const bloque = primeraFila(
        await tx
          .insert(bloquesAsignacion)
          .values({
            asignacionId,
            posicion: b.position,
            tipoBloque: b.block_type,
            titulo: b.title ?? null,
            textoLibre: b.body_text ?? null,
            formatoWod: b.wod_format ?? null,
            ...(b.config ? { config: b.config } : {}),
          })
          .returning({ id: bloquesAsignacion.id }),
        'el alta del bloque de la asignación',
      );

      if (b.items && b.items.length > 0) {
        await tx.insert(itemsAsignacion).values(
          b.items.map((i) => ({
            bloqueId: bloque.id,
            posicion: i.position,
            ejercicioId: i.exercise_id,
            ...(i.prescription ? { prescripcion: i.prescription } : {}),
            notas: i.notes ?? null,
            supersetKey: i.superset_key ?? null,
          })),
        );
      }
    }
  }

  private async tieneContenido(asignacionId: string): Promise<boolean> {
    const [fila] = await this.db
      .select({ id: bloquesAsignacion.id })
      .from(bloquesAsignacion)
      .where(eq(bloquesAsignacion.asignacionId, asignacionId))
      .limit(1);
    return fila !== undefined;
  }

  /** Escribir exige ser el coach dueño de la relación de la que cuelga. */
  private async exigirMia(coachId: string, asignacionId: string) {
    const [fila] = await this.db
      .select()
      .from(asignaciones)
      .where(eq(asignaciones.id, asignacionId))
      .limit(1);

    if (!fila) throw Errores.noEncontrado('asignación');
    // Pasa por la relación: si no es de este coach, para él no existe.
    const mias = await this.acceso.relacionesDelCoach(coachId);
    if (!mias.includes(fila.coachAtletaId)) throw Errores.noEncontrado('asignación');
    if (fila.archivadaEn) throw Errores.noEncontrado('asignación');
    return fila;
  }

  /** Leer: el coach dueño, o el atleta si ya está publicada. */
  private async exigirVisible(usuarioId: string, asignacionId: string) {
    const [fila] = await this.db
      .select()
      .from(asignaciones)
      .where(eq(asignaciones.id, asignacionId))
      .limit(1);

    if (!fila || fila.archivadaEn) throw Errores.noEncontrado('asignación');

    const comoCoach = await this.acceso.relacionesDelCoach(usuarioId);
    if (comoCoach.includes(fila.coachAtletaId)) return fila;

    const comoAtleta = await this.acceso.relacionesDelAtleta(usuarioId);
    if (comoAtleta.includes(fila.coachAtletaId) && fila.estado !== 'borrador') return fila;

    throw Errores.noEncontrado('asignación');
  }

  private async zonaDelAtleta(atletaId: string): Promise<string> {
    const [fila] = await this.db
      .select({ zona: usuarios.zonaHoraria })
      .from(usuarios)
      .where(eq(usuarios.id, atletaId))
      .limit(1);
    return fila?.zona ?? 'America/Mexico_City';
  }
}
