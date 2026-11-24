/**
 * Plantillas del coach: lo que arma una vez y reutiliza.
 *
 * Una plantilla es del coach y solo de él. No se comparten entre coaches en la
 * Versión 1, así que la autorización es simple: `owner_coach_id = el coach`.
 *
 * Lo que hay que tener presente al leer esto: **cambiar una plantilla no toca
 * nada de lo ya asignado** (regla 1). Eso no se logra aquí, se logra en
 * asignaciones, que copia los bloques en lugar de apuntarlos. Aquí se puede
 * reemplazar la plantilla entera sin pensar en quién la usó.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AccesoService } from '../acceso/acceso.service';
import { Errores } from '../comun/errores';
import { primeraFila } from '../comun/uno';
import { catalogo, type AlcancePlantilla } from '../db/catalogo';
import { DB, type Db } from '../db/db.module';
import type { BloqueDto } from '../programacion/bloques.dto';
import { BloquesService } from '../programacion/bloques.service';

const { bloquesPlantilla, itemsPlantilla, plantillas } = catalogo;

export interface PlantillaEntrada {
  name: string;
  discipline?: string | null;
  scope?: AlcancePlantilla;
  description?: string | null;
  blocks?: BloqueDto[];
}

@Injectable()
export class PlantillasService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly acceso: AccesoService,
    private readonly bloques: BloquesService,
  ) {}

  // --------------------------------------------------------------- consultar

  async mias(coachId: string, filtros: { discipline?: string; scope?: AlcancePlantilla } = {}) {
    await this.acceso.exigirCoach(coachId);

    const condiciones = [eq(plantillas.coachId, coachId), eq(plantillas.estado, 'activa')];
    if (filtros.discipline) condiciones.push(eq(plantillas.disciplina, filtros.discipline));
    if (filtros.scope) condiciones.push(eq(plantillas.alcance, filtros.scope));

    const filas = await this.db
      .select()
      .from(plantillas)
      .where(and(...condiciones))
      .orderBy(asc(plantillas.nombre));

    // La lista no trae los bloques: el coach ve nombres y abre la que quiere.
    // Traerlos todos aquí serían cientos de filas para pintar un menú.
    return filas.map((p) => ({
      id: p.id,
      name: p.nombre,
      discipline: p.disciplina,
      scope: p.alcance,
      description: p.descripcion,
      created_at: p.creadoEn.toISOString(),
    }));
  }

  async ver(coachId: string, plantillaId: string) {
    const plantilla = await this.exigirMia(coachId, plantillaId);

    const bloques = await this.db
      .select()
      .from(bloquesPlantilla)
      .where(eq(bloquesPlantilla.plantillaId, plantillaId))
      .orderBy(asc(bloquesPlantilla.diaOffset), asc(bloquesPlantilla.posicion));

    const items =
      bloques.length === 0
        ? []
        : await this.db
            .select()
            .from(itemsPlantilla)
            // Filtrar por los bloques DE ESTA plantilla. Sin este where la
            // consulta devolvería los ítems de todas las plantillas de la
            // base, de todos los coaches.
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

    return {
      id: plantilla.id,
      name: plantilla.nombre,
      discipline: plantilla.disciplina,
      scope: plantilla.alcance,
      description: plantilla.descripcion,
      created_at: plantilla.creadoEn.toISOString(),
      blocks: bloques.map((b) => ({
        position: b.posicion,
        block_type: b.tipoBloque,
        title: b.titulo,
        body_text: b.textoLibre,
        wod_format: b.formatoWod,
        config: b.config,
        day_offset: b.diaOffset,
        items: (porBloque.get(b.id) ?? []).map((i) => ({
          position: i.posicion,
          exercise_id: i.ejercicioId,
          prescription: i.prescripcion,
          notes: i.notas,
          superset_key: i.supersetKey,
        })),
      })),
    };
  }

  // ------------------------------------------------------------------ crear

  async crear(coachId: string, datos: PlantillaEntrada) {
    await this.acceso.exigirCoach(coachId);
    const validados = await this.bloques.validar(coachId, datos.blocks ?? []);

    const id = await this.db.transaction(async (tx) => {
      const plantilla = primeraFila(
        await tx
          .insert(plantillas)
          .values({
            coachId,
            nombre: datos.name.trim(),
            ...(datos.discipline ? { disciplina: datos.discipline } : {}),
            ...(datos.scope ? { alcance: datos.scope } : {}),
            ...(datos.description ? { descripcion: datos.description } : {}),
          })
          .returning({ id: plantillas.id }),
        'el alta de la plantilla',
      );

      await this.escribirBloques(tx, plantilla.id, validados);
      return plantilla.id;
    });

    return this.ver(coachId, id);
  }

  /**
   * Reemplaza la plantilla completa. Es un PUT y se comporta como tal: los
   * bloques viejos se van y entran los nuevos.
   *
   * Borrar y reescribir en lugar de hacer un diff es a propósito. Un diff
   * tendría que decidir qué bloque del cliente corresponde a cuál de la base,
   * y la web del coach los reordena arrastrándolos: cualquier heurística se
   * equivoca. Aquí no hay histórico colgando — eso vive en las asignaciones,
   * que ya tienen su copia — así que borrar es seguro.
   */
  async reemplazar(coachId: string, plantillaId: string, datos: PlantillaEntrada) {
    await this.exigirMia(coachId, plantillaId);
    const validados = await this.bloques.validar(coachId, datos.blocks ?? []);

    await this.db.transaction(async (tx) => {
      await tx
        .update(plantillas)
        .set({
          nombre: datos.name.trim(),
          disciplina: datos.discipline ?? null,
          ...(datos.scope ? { alcance: datos.scope } : {}),
          descripcion: datos.description ?? null,
          actualizadoEn: new Date(),
        })
        .where(eq(plantillas.id, plantillaId));

      // Los ítems se van en cascada con sus bloques.
      await tx.delete(bloquesPlantilla).where(eq(bloquesPlantilla.plantillaId, plantillaId));
      await this.escribirBloques(tx, plantillaId, validados);
    });

    return this.ver(coachId, plantillaId);
  }

  /** Archiva (regla 4): las asignaciones guardan de dónde salieron. */
  async archivar(coachId: string, plantillaId: string): Promise<void> {
    await this.exigirMia(coachId, plantillaId);
    await this.db
      .update(plantillas)
      .set({ estado: 'archivada', actualizadoEn: new Date() })
      .where(eq(plantillas.id, plantillaId));
  }

  // ----------------------------------------------------------------- comunes

  private async escribirBloques(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    plantillaId: string,
    bloques: Awaited<ReturnType<BloquesService['validar']>>,
  ): Promise<void> {
    for (const b of bloques) {
      const bloque = primeraFila(
        await tx
          .insert(bloquesPlantilla)
          .values({
            plantillaId,
            posicion: b.position,
            tipoBloque: b.block_type,
            titulo: b.title ?? null,
            textoLibre: b.body_text ?? null,
            formatoWod: b.wod_format ?? null,
            ...(b.config ? { config: b.config } : {}),
            ...(b.day_offset !== undefined ? { diaOffset: b.day_offset } : {}),
          })
          .returning({ id: bloquesPlantilla.id }),
        'el alta del bloque',
      );

      if (b.items && b.items.length > 0) {
        await tx.insert(itemsPlantilla).values(
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

  private async exigirMia(coachId: string, plantillaId: string) {
    const [fila] = await this.db
      .select()
      .from(plantillas)
      .where(eq(plantillas.id, plantillaId))
      .limit(1);

    // 404 y no 403: la plantilla de otro coach no existe para este coach.
    if (!fila || fila.coachId !== coachId) throw Errores.noEncontrado('plantilla');
    return fila;
  }
}
