/**
 * Validación de bloques, compartida entre plantillas y asignaciones.
 *
 * Son las mismas reglas en los dos lados, y tenerlas en un solo lugar es lo
 * que evita que una plantilla acepte algo que una asignación rechaza.
 *
 * Lo que se revisa aquí, y por qué cada cosa:
 *
 *   - El tipo de bloque y el formato de WOD existen en el catálogo. Si no,
 *     la llave foránea reventaría con un error de base que el coach no
 *     entiende; mejor un 422 que diga qué campo.
 *   - Un bloque de texto (White Board) no lleva ejercicios, y uno de
 *     ejercicios no lleva texto libre. Mezclarlos deja al cliente sin saber
 *     qué dibujar.
 *   - **Cada ejercicio referenciado tiene que ser visible para el coach.**
 *     Esta es la importante: sin ella, un coach podría meter en su plantilla
 *     el id de un ejercicio privado de otro coach y leerle el nombre y las
 *     indicaciones a través de su propia sesión. Es acceso indebido por la
 *     puerta de atrás, y tiene su prueba.
 *   - Las posiciones no se repiten. Hay un índice único que lo garantiza,
 *     pero un 422 con el campo señalado es mejor que un 409 genérico.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Errores } from '../comun/errores';
import { catalogo, type ClaseBloque } from '../db/catalogo';
import { DB, type Db } from '../db/db.module';
import { EjerciciosService } from '../ejercicios/ejercicios.service';
import type { BloqueDto } from './bloques.dto';

const { ejercicios, formatosWod, tiposBloque } = catalogo;

export interface BloqueValidado extends BloqueDto {
  clase: ClaseBloque;
}

@Injectable()
export class BloquesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ejerciciosServicio: EjerciciosService,
  ) {}

  /**
   * Valida la lista completa de bloques de una plantilla o asignación y
   * devuelve cada uno con su clase resuelta, para que quien escriba no tenga
   * que volver a consultar el catálogo.
   */
  async validar(coachId: string, bloques: BloqueDto[]): Promise<BloqueValidado[]> {
    if (bloques.length === 0) return [];

    const fallas: { field: string; code: string }[] = [];

    // --- posiciones únicas, por día
    const vistas = new Set<string>();
    for (const b of bloques) {
      const llave = `${b.day_offset ?? 0}:${b.position}`;
      if (vistas.has(llave)) {
        fallas.push({ field: `blocks[${b.position}].position`, code: 'repetida' });
      }
      vistas.add(llave);
    }

    // --- tipos de bloque del catálogo
    const tipos = [...new Set(bloques.map((b) => b.block_type))];
    const filasTipo = await this.db
      .select({ slug: tiposBloque.slug, clase: tiposBloque.clase })
      .from(tiposBloque)
      .where(inArray(tiposBloque.slug, tipos));
    const claseDe = new Map(filasTipo.map((f) => [f.slug, f.clase]));

    for (const t of tipos) {
      if (!claseDe.has(t)) {
        fallas.push({ field: `blocks.block_type:${t}`, code: 'desconocido' });
      }
    }

    // --- formatos de WOD del catálogo
    const formatos = [...new Set(bloques.map((b) => b.wod_format).filter((f): f is string => !!f))];
    if (formatos.length > 0) {
      const filasFormato = await this.db
        .select({ slug: formatosWod.slug })
        .from(formatosWod)
        .where(inArray(formatosWod.slug, formatos));
      const conocidos = new Set(filasFormato.map((f) => f.slug));
      for (const f of formatos) {
        if (!conocidos.has(f)) {
          fallas.push({ field: `blocks.wod_format:${f}`, code: 'desconocido' });
        }
      }
    }

    // --- coherencia entre la clase del bloque y su contenido
    for (const b of bloques) {
      const clase = claseDe.get(b.block_type);
      if (!clase) continue;

      if (clase === 'texto') {
        if (b.items && b.items.length > 0) {
          fallas.push({ field: `blocks[${b.position}].items`, code: 'bloque_de_texto' });
        }
        if (!b.body_text || b.body_text.trim().length === 0) {
          fallas.push({ field: `blocks[${b.position}].body_text`, code: 'requerido' });
        }
      } else {
        // `body_text` SÍ va en un bloque de ejercicios: son sus indicaciones,
        // lo que el atleta tiene que hacer. Esta regla antes lo rechazaba y
        // estaba mal: un EMOM con «cada minuto: 5 wall balls, 5 burpees, 3
        // double unders» no se expresa con los campos del formato ni con las
        // filas de ejercicio, y es la forma en que un coach escribe un WOD.
        //
        // Las dos cosas conviven a propósito. Las filas dan seguimiento de
        // progreso y enlace al video; el texto dice cómo se ejecuta —minutos
        // alternos, en pareja, el cierre— que las filas no pueden expresar.
        if (!b.items || b.items.length === 0) {
          fallas.push({ field: `blocks[${b.position}].items`, code: 'requerido' });
        }
        // Posiciones únicas dentro del bloque.
        const pos = new Set<number>();
        for (const it of b.items ?? []) {
          if (pos.has(it.position)) {
            fallas.push({
              field: `blocks[${b.position}].items[${it.position}].position`,
              code: 'repetida',
            });
          }
          pos.add(it.position);
        }
      }
    }

    // --- los ejercicios existen y este coach los puede ver
    const ids = [...new Set(bloques.flatMap((b) => (b.items ?? []).map((i) => i.exercise_id)))];
    if (ids.length > 0) {
      const visibles = await this.ejerciciosVisibles(coachId, ids);
      for (const id of ids) {
        if (!visibles.has(id)) {
          // No decimos "existe pero no es tuyo": sería confirmarle a un coach
          // que el ejercicio privado de otro coach existe.
          fallas.push({ field: `blocks.items.exercise_id:${id}`, code: 'no_encontrado' });
        }
      }
    }

    if (fallas.length > 0) throw Errores.noProcesable(fallas);

    return bloques.map((b) => ({ ...b, clase: claseDe.get(b.block_type) as ClaseBloque }));
  }

  /**
   * De una lista de ids, cuáles puede usar este coach: los activos del
   * catálogo público y los activos suyos.
   */
  private async ejerciciosVisibles(coachId: string, ids: string[]): Promise<Set<string>> {
    const filas = await this.db
      .select({ id: ejercicios.id, esPublico: ejercicios.esPublico, coachId: ejercicios.coachId })
      .from(ejercicios)
      .where(and(inArray(ejercicios.id, ids), eq(ejercicios.estado, 'activo')));

    return new Set(
      filas.filter((f) => f.esPublico || f.coachId === coachId).map((f) => f.id),
    );
  }

  /** El catálogo que la web del coach necesita para dibujar el menú de bloques. */
  async catalogoDeBloques() {
    const [tipos, formatos] = await Promise.all([
      this.db.select().from(tiposBloque).orderBy(tiposBloque.posicion),
      this.db.select().from(formatosWod),
    ]);
    return {
      block_types: tipos.map((t) => ({
        slug: t.slug,
        name_es: t.nombre,
        tag_es: t.etiqueta,
        kind: t.clase,
      })),
      wod_formats: formatos.map((f) => ({
        slug: f.slug,
        name_es: f.nombre,
        description_es: f.descripcion,
        score_type: f.tipoPuntaje,
        lower_is_better: f.menorEsMejor,
        fields: f.campos,
        athlete_logs: f.registraAtleta,
      })),
    };
  }
}
