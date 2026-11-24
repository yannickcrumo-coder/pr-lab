/**
 * Biblioteca de ejercicios: el catálogo público más los que el coach crea.
 *
 * Reglas de propiedad, que vienen del esquema:
 *   público  → `is_public = true`  y `owner_coach_id IS NULL`
 *   propio   → `is_public = false` y `owner_coach_id = el coach`
 * La restricción `exercises_ownership` impide cualquier otra combinación, así
 * que no hay que defenderse de un ejercicio "público de alguien".
 *
 * Quién ve qué: un coach ve lo público y lo suyo. Un atleta ve lo público y lo
 * de los coaches con los que tiene relación viva — si no, abriría su sesión y
 * encontraría un ejercicio que no puede leer.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, arrayContains, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { AccesoService } from '../acceso/acceso.service';
import { Errores } from '../comun/errores';
import { primeraFila } from '../comun/uno';
import { catalogo, type Ejercicio, type Metrica, type NivelEjercicio } from '../db/catalogo';
import { DB, type Db } from '../db/db.module';

const { ejercicios } = catalogo;

/** Tope duro: el cliente puede pedir menos, nunca más. */
const LIMITE_MAXIMO = 100;
const LIMITE_POR_OMISION = 50;

export interface FiltrosBusqueda {
  q?: string;
  discipline?: string;
  equipment?: string;
  pattern?: string;
  mine?: boolean;
  cursor?: string;
  limit?: number;
}

/**
 * Al editar, `null` significa "límpialo" y `undefined` significa "no lo
 * toques". Son cosas distintas y el tipo tiene que distinguirlas, o no habría
 * forma de quitarle el enlace de video a un ejercicio.
 */
export interface EjercicioParche
  extends Partial<
    Omit<EjercicioEntrada, 'pattern' | 'cue_es' | 'video_media_id' | 'video_url' | 'duplicate_of'>
  > {
  pattern?: string | null;
  cue_es?: string | null;
  video_media_id?: string | null;
  video_url?: string | null;
}

export interface EjercicioEntrada {
  name_es: string;
  metrics: Metrica[];
  disciplines?: string[];
  pattern?: string;
  primary_muscles?: string[];
  equipment?: string[];
  level?: NivelEjercicio;
  cue_es?: string;
  video_media_id?: string;
  video_url?: string;
  duplicate_of?: string;
  unilateral?: boolean;
  tracks_one_rep_max?: boolean;
}

@Injectable()
export class EjerciciosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly acceso: AccesoService,
  ) {}

  // --------------------------------------------------------------- consultar

  /**
   * Qué ejercicios puede ver este usuario, como condición SQL reusable.
   *
   * Para un atleta hay que resolver primero de qué coaches depende, porque la
   * condición necesita la lista de ids.
   */
  private async visibilidad(usuarioId: string, esCoach: boolean) {
    const publico = and(eq(ejercicios.esPublico, true), isNull(ejercicios.coachId));

    if (esCoach) {
      return or(publico, eq(ejercicios.coachId, usuarioId))!;
    }

    const coaches = await this.acceso.coachesDelAtleta(usuarioId);
    if (coaches.length === 0) return publico!;
    return or(publico, inArray(ejercicios.coachId, coaches))!;
  }

  async buscar(usuarioId: string, filtros: FiltrosBusqueda) {
    const esCoach = await this.acceso.esCoach(usuarioId);
    const limite = Math.min(Math.max(filtros.limit ?? LIMITE_POR_OMISION, 1), LIMITE_MAXIMO);
    const condiciones = [eq(ejercicios.estado, 'activo')];

    if (filtros.mine) {
      if (!esCoach) throw Errores.prohibido('solo un coach tiene ejercicios propios');
      condiciones.push(eq(ejercicios.coachId, usuarioId));
    } else {
      condiciones.push(await this.visibilidad(usuarioId, esCoach));
    }

    if (filtros.discipline) {
      condiciones.push(arrayContains(ejercicios.disciplinas, [filtros.discipline]));
    }
    if (filtros.equipment) {
      condiciones.push(arrayContains(ejercicios.equipo, [filtros.equipment]));
    }
    if (filtros.pattern) {
      condiciones.push(eq(ejercicios.patron, filtros.pattern));
    }
    if (filtros.q) {
      // Busca en el nombre y en los alias: el coach escribe "peso muerto"
      // pero también "deadlift", y las dos deben encontrar lo mismo.
      const aguja = `%${filtros.q.trim()}%`;
      condiciones.push(
        sql`(${ejercicios.nombre} ILIKE ${aguja}
             OR ${ejercicios.nombreEn} ILIKE ${aguja}
             OR EXISTS (
               SELECT 1 FROM unnest(${ejercicios.alias}) AS alias
               WHERE alias ILIKE ${aguja}
             ))`,
      );
    }

    // Cursor sobre sync_seq, que es monótono y único. Paginar por nombre se
    // rompe cuando dos ejercicios se llaman igual.
    if (filtros.cursor) {
      const seq = Number(filtros.cursor);
      if (!Number.isSafeInteger(seq) || seq < 0) {
        throw Errores.noProcesable([{ field: 'cursor', code: 'invalido' }]);
      }
      condiciones.push(lt(ejercicios.syncSeq, seq));
    }

    const filas = await this.db
      .select()
      .from(ejercicios)
      .where(and(...condiciones))
      .orderBy(desc(ejercicios.syncSeq))
      .limit(limite + 1);

    const hayMas = filas.length > limite;
    const pagina = hayMas ? filas.slice(0, limite) : filas;
    const ultimo = pagina.at(-1);

    return {
      data: pagina.map((e) => this.aPublico(e)),
      next_cursor: hayMas && ultimo ? String(ultimo.syncSeq) : null,
    };
  }

  async ver(usuarioId: string, ejercicioId: string) {
    const esCoach = await this.acceso.esCoach(usuarioId);
    const [fila] = await this.db
      .select()
      .from(ejercicios)
      .where(and(eq(ejercicios.id, ejercicioId), await this.visibilidad(usuarioId, esCoach)))
      .limit(1);

    // No distinguimos "no existe" de "no es tuyo": contestar distinto le diría
    // a un coach que el ejercicio de otro coach existe.
    if (!fila) throw Errores.noEncontrado('ejercicio');
    return this.aPublico(fila);
  }

  // ------------------------------------------------------------------- crear

  async crear(coachId: string, datos: EjercicioEntrada) {
    await this.acceso.exigirCoach(coachId);

    let base: Partial<Ejercicio> = {};
    if (datos.duplicate_of) {
      // Partir de uno del catálogo: se copian los campos descriptivos y el
      // coach ajusta lo que quiera. La copia es independiente desde el inicio.
      const origen = await this.ver(coachId, datos.duplicate_of);
      base = {
        disciplinas: origen.disciplines,
        patron: origen.pattern,
        musculosPrimarios: origen.primary_muscles,
        musculosSecundarios: origen.secondary_muscles,
        equipo: origen.equipment,
        metricas: origen.metrics,
        unilateral: origen.unilateral,
        nivel: origen.level,
        indicacion: origen.cue_es,
        sigueUnaRepeticionMaxima: origen.tracks_one_rep_max,
      };
    }

    const fila = primeraFila(
      await this.db
        .insert(ejercicios)
        .values({
          ...base,
          slug: await this.slugLibre(datos.name_es),
          nombre: datos.name_es.trim(),
          metricas: datos.metrics,
          ...(datos.disciplines ? { disciplinas: datos.disciplines } : {}),
          ...(datos.pattern ? { patron: datos.pattern } : {}),
          ...(datos.primary_muscles ? { musculosPrimarios: datos.primary_muscles } : {}),
          ...(datos.equipment ? { equipo: datos.equipment } : {}),
          ...(datos.level ? { nivel: datos.level } : {}),
          ...(datos.cue_es ? { indicacion: datos.cue_es } : {}),
          ...(datos.video_media_id ? { videoMediaId: datos.video_media_id } : {}),
          ...(datos.video_url ? { videoUrl: datos.video_url } : {}),
          ...(datos.unilateral !== undefined ? { unilateral: datos.unilateral } : {}),
          ...(datos.tracks_one_rep_max !== undefined
            ? { sigueUnaRepeticionMaxima: datos.tracks_one_rep_max }
            : {}),
          esPublico: false,
          coachId,
          origen: 'coach',
        })
        .returning(),
      'el alta del ejercicio',
    );
    return this.aPublico(fila);
  }

  /**
   * El slug es único por tabla, así que el del coach no puede chocar con uno
   * del catálogo ni con otro suyo. Se le cuelga un sufijo hasta que entre.
   */
  private async slugLibre(nombre: string): Promise<string> {
    const raiz =
      nombre
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 48) || 'ejercicio';

    for (let intento = 0; intento < 50; intento++) {
      const candidato = intento === 0 ? raiz : `${raiz}-${intento + 1}`;
      const [choca] = await this.db
        .select({ id: ejercicios.id })
        .from(ejercicios)
        .where(eq(ejercicios.slug, candidato))
        .limit(1);
      if (!choca) return candidato;
    }
    return `${raiz}-${Date.now()}`;
  }

  // ------------------------------------------------------------------ editar

  async editar(coachId: string, ejercicioId: string, cambios: EjercicioParche) {
    await this.exigirPropio(coachId, ejercicioId);

    const fila = primeraFila(
      await this.db
        .update(ejercicios)
        .set({
          ...(cambios.name_es ? { nombre: cambios.name_es.trim() } : {}),
          ...(cambios.metrics ? { metricas: cambios.metrics } : {}),
          ...(cambios.disciplines ? { disciplinas: cambios.disciplines } : {}),
          ...(cambios.pattern !== undefined ? { patron: cambios.pattern } : {}),
          ...(cambios.primary_muscles ? { musculosPrimarios: cambios.primary_muscles } : {}),
          ...(cambios.equipment ? { equipo: cambios.equipment } : {}),
          ...(cambios.level ? { nivel: cambios.level } : {}),
          ...(cambios.cue_es !== undefined ? { indicacion: cambios.cue_es } : {}),
          ...(cambios.video_media_id !== undefined
            ? { videoMediaId: cambios.video_media_id }
            : {}),
          ...(cambios.video_url !== undefined ? { videoUrl: cambios.video_url } : {}),
          ...(cambios.unilateral !== undefined ? { unilateral: cambios.unilateral } : {}),
          ...(cambios.tracks_one_rep_max !== undefined
            ? { sigueUnaRepeticionMaxima: cambios.tracks_one_rep_max }
            : {}),
          actualizadoEn: new Date(),
        })
        .where(eq(ejercicios.id, ejercicioId))
        .returning(),
      'la edición del ejercicio',
    );
    return this.aPublico(fila);
  }

  /**
   * Archiva, nunca borra (regla 4): el ejercicio puede estar colgado de
   * sesiones ya registradas y el histórico del atleta no se toca.
   */
  async archivar(coachId: string, ejercicioId: string): Promise<void> {
    await this.exigirPropio(coachId, ejercicioId);
    await this.db
      .update(ejercicios)
      .set({ estado: 'archivado', actualizadoEn: new Date() })
      .where(eq(ejercicios.id, ejercicioId));
  }

  /** Solo el dueño edita o archiva. El catálogo público no lo toca nadie. */
  private async exigirPropio(coachId: string, ejercicioId: string): Promise<Ejercicio> {
    const [fila] = await this.db
      .select()
      .from(ejercicios)
      .where(eq(ejercicios.id, ejercicioId))
      .limit(1);

    if (!fila) throw Errores.noEncontrado('ejercicio');
    if (fila.esPublico) {
      throw Errores.prohibido('el catálogo público no se edita; duplícalo y edita tu copia');
    }
    if (fila.coachId !== coachId) throw Errores.noEncontrado('ejercicio');
    return fila;
  }

  // ------------------------------------------------------------------ salida

  aPublico(e: Ejercicio) {
    return {
      id: e.id,
      slug: e.slug,
      name_es: e.nombre,
      name_en: e.nombreEn,
      aliases_es: e.alias,
      disciplines: e.disciplinas,
      pattern: e.patron,
      primary_muscles: e.musculosPrimarios,
      secondary_muscles: e.musculosSecundarios,
      equipment: e.equipo,
      metrics: e.metricas,
      unilateral: e.unilateral,
      level: e.nivel,
      tracks_one_rep_max: e.sigueUnaRepeticionMaxima,
      cue_es: e.indicacion,
      /**
       * El cliente necesita saber si el video sirve sin señal, no solo dónde
       * está. `alojado` se puede guardar en el teléfono; `enlace` se abre
       * fuera de la app y requiere conexión.
       */
      video: e.videoMediaId
        ? { tipo: 'alojado' as const, media_id: e.videoMediaId, offline: true }
        : e.videoUrl
          ? { tipo: 'enlace' as const, url: e.videoUrl, offline: false }
          : null,
      is_public: e.esPublico,
      is_mine: e.coachId !== null,
      status: e.estado,
      sync_seq: e.syncSeq,
    };
  }
}
