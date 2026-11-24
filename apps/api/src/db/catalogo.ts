/**
 * Esquema de Drizzle para el catálogo, las plantillas y las asignaciones.
 *
 * Las migraciones de `db/migrations` siguen siendo la fuente de verdad; aquí
 * solo describimos las tablas para tener consultas tipadas.
 *
 * Nota sobre la forma de los datos: la prescripción vive en `jsonb` a
 * propósito. Una serie de fuerza, un AMRAP de CrossFit y un bloque de
 * intervalos de correr no comparten columnas, y forzarlas a una tabla ancha
 * con treinta columnas nulas haría el esquema peor, no mejor. Lo que sí está
 * tipado es la forma de ese JSON, en `packages/types`.
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { coachAtleta, usuarios } from './esquema';

export type Metrica =
  | 'reps'
  | 'carga'
  | 'tiempo'
  | 'distancia'
  | 'calorias'
  | 'rondas'
  | 'altura'
  | 'rpe';
export type NivelEjercicio = 'principiante' | 'intermedio' | 'avanzado';
export type EstadoEjercicio = 'activo' | 'archivado';
export type OrigenEjercicio = 'seed' | 'coach';
export type AlcancePlantilla = 'dia' | 'semana' | 'ciclo';
export type EstadoPlantilla = 'activa' | 'archivada';
export type EstadoAsignacion = 'borrador' | 'publicada' | 'completada' | 'parcial' | 'omitida';
export type ClaseBloque = 'ejercicios' | 'texto';

// ----------------------------------------------------------------- catálogos

export const disciplinas = pgTable('disciplines', {
  slug: text('slug').primaryKey(),
  nombre: text('name_es').notNull(),
  posicion: integer('position').notNull().default(0),
});

export const tiposBloque = pgTable('block_types', {
  slug: text('slug').primaryKey(),
  nombre: text('name_es').notNull(),
  etiqueta: text('tag_es').notNull(),
  /** `texto` es el White Board: no lleva ejercicios, lleva lo que el coach escriba. */
  clase: text('kind').notNull().$type<ClaseBloque>(),
  posicion: integer('position').notNull().default(0),
});

export const formatosWod = pgTable('wod_formats', {
  slug: text('slug').primaryKey(),
  nombre: text('name_es').notNull(),
  descripcion: text('description_es').notNull(),
  tipoPuntaje: text('score_type').notNull(),
  menorEsMejor: boolean('lower_is_better').notNull().default(false),
  campos: jsonb('fields').notNull().default([]),
  registraAtleta: jsonb('athlete_logs').notNull().default([]),
});

// ---------------------------------------------------------------- ejercicios

export const ejercicios = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    nombre: text('name_es').notNull(),
    nombreEn: text('name_en'),
    alias: text('aliases_es').array().notNull().default([]),
    disciplinas: text('disciplines').array().notNull().default([]),
    patron: text('pattern'),
    musculosPrimarios: text('primary_muscles').array().notNull().default([]),
    musculosSecundarios: text('secondary_muscles').array().notNull().default([]),
    equipo: text('equipment').array().notNull().default([]),
    /** Qué registra el atleta. Decide la forma de la fila de registro. */
    metricas: text('metrics').array().notNull().$type<Metrica[]>().default(['reps']),
    unilateral: boolean('unilateral').notNull().default(false),
    nivel: text('level').$type<NivelEjercicio>(),
    sigueUnaRepeticionMaxima: boolean('tracks_one_rep_max').notNull().default(false),
    indicacion: text('cue_es'),
    /** Video nuestro: se guarda en el teléfono y sirve sin señal. */
    videoMediaId: uuid('video_media_id'),
    /** Enlace externo: se abre FUERA de la app y necesita conexión. */
    videoUrl: text('video_url'),
    esPublico: boolean('is_public').notNull().default(false),
    coachId: uuid('owner_coach_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    origen: text('source').notNull().$type<OrigenEjercicio>().default('coach'),
    estado: text('status').notNull().$type<EstadoEjercicio>().default('activo'),
    syncSeq: bigint('sync_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq_global')`),
    creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ix_ejercicios_coach').on(t.coachId, t.estado),
    index('ix_ejercicios_publicos').on(t.esPublico, t.estado),
  ],
);

/** Aristas de escalado: de este ejercicio, hacia cuál se va si hay que facilitarlo. */
export const escaladosEjercicio = pgTable(
  'exercise_scalings',
  {
    ejercicioId: uuid('exercise_id')
      .notNull()
      .references(() => ejercicios.id, { onDelete: 'cascade' }),
    destinoId: uuid('target_id')
      .notNull()
      .references(() => ejercicios.id, { onDelete: 'cascade' }),
    direccion: text('direction').notNull().$type<'mas_facil' | 'mas_dificil'>(),
  },
  (t) => [primaryKey({ columns: [t.ejercicioId, t.destinoId, t.direccion] })],
);

// ---------------------------------------------------------------- plantillas

export const plantillas = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coachId: uuid('owner_coach_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    nombre: text('name').notNull(),
    disciplina: text('discipline').references(() => disciplinas.slug),
    alcance: text('scope').notNull().$type<AlcancePlantilla>().default('dia'),
    descripcion: text('description'),
    estado: text('status').notNull().$type<EstadoPlantilla>().default('activa'),
    creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ix_plantillas_coach').on(t.coachId, t.estado)],
);

export const bloquesPlantilla = pgTable(
  'template_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plantillaId: uuid('template_id')
      .notNull()
      .references(() => plantillas.id, { onDelete: 'cascade' }),
    posicion: integer('position').notNull(),
    tipoBloque: text('block_type')
      .notNull()
      .references(() => tiposBloque.slug),
    titulo: text('title'),
    /** White Board: el texto libre que escribe el coach. */
    textoLibre: text('body_text'),
    formatoWod: text('wod_format').references(() => formatosWod.slug),
    config: jsonb('config').notNull().default({}),
    /** Para plantillas de semana o ciclo: 0 = primer día. */
    diaOffset: integer('day_offset').notNull().default(0),
  },
  (t) => [uniqueIndex('ux_bloques_plantilla').on(t.plantillaId, t.diaOffset, t.posicion)],
);

export const itemsPlantilla = pgTable(
  'template_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bloqueId: uuid('block_id')
      .notNull()
      .references(() => bloquesPlantilla.id, { onDelete: 'cascade' }),
    posicion: integer('position').notNull(),
    ejercicioId: uuid('exercise_id')
      .notNull()
      .references(() => ejercicios.id),
    prescripcion: jsonb('prescription').notNull().default({}),
    notas: text('notes'),
    /** Mismo valor = mismo superset. */
    supersetKey: text('superset_key'),
  },
  (t) => [uniqueIndex('ux_items_plantilla').on(t.bloqueId, t.posicion)],
);

// -------------------------------------------------------------- asignaciones

export const ciclos = pgTable('cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  coachAtletaId: uuid('coach_athlete_id')
    .notNull()
    .references(() => coachAtleta.id, { onDelete: 'cascade' }),
  nombre: text('name').notNull(),
  objetivo: text('goal'),
  inicia: date('starts_on').notNull(),
  termina: date('ends_on').notNull(),
  creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const asignaciones = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Cuelga de la RELACIÓN, no del atleta. Es lo que hace que dos coaches del
     * mismo atleta no se vean entre sí sin tener que acordarse de filtrar.
     */
    coachAtletaId: uuid('coach_athlete_id')
      .notNull()
      .references(() => coachAtleta.id, { onDelete: 'cascade' }),
    cicloId: uuid('cycle_id').references(() => ciclos.id, { onDelete: 'set null' }),
    /** De dónde se copió. Informativo: la copia ya es independiente. */
    plantillaOrigenId: uuid('source_template_id').references(() => plantillas.id, {
      onDelete: 'set null',
    }),
    titulo: text('title').notNull(),
    disciplina: text('discipline').references(() => disciplinas.slug),
    /** Fecha LOCAL del atleta, con la zona con que se calculó. */
    fecha: date('scheduled_date').notNull(),
    zonaHorariaAtleta: text('athlete_timezone').notNull(),
    estado: text('status').notNull().$type<EstadoAsignacion>().default('borrador'),
    version: integer('version').notNull().default(1),
    notaCoach: text('coach_note'),
    publicadaEn: timestamp('published_at', { withTimezone: true }),
    syncSeq: bigint('sync_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq_global')`),
    creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivadaEn: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('ix_asignaciones_relacion_fecha').on(t.coachAtletaId, t.fecha)],
);

export const bloquesAsignacion = pgTable(
  'assignment_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    asignacionId: uuid('assignment_id')
      .notNull()
      .references(() => asignaciones.id, { onDelete: 'cascade' }),
    posicion: integer('position').notNull(),
    tipoBloque: text('block_type')
      .notNull()
      .references(() => tiposBloque.slug),
    titulo: text('title'),
    textoLibre: text('body_text'),
    formatoWod: text('wod_format').references(() => formatosWod.slug),
    config: jsonb('config').notNull().default({}),
  },
  (t) => [uniqueIndex('ux_bloques_asignacion').on(t.asignacionId, t.posicion)],
);

export const itemsAsignacion = pgTable(
  'assignment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bloqueId: uuid('block_id')
      .notNull()
      .references(() => bloquesAsignacion.id, { onDelete: 'cascade' }),
    posicion: integer('position').notNull(),
    ejercicioId: uuid('exercise_id')
      .notNull()
      .references(() => ejercicios.id),
    prescripcion: jsonb('prescription').notNull().default({}),
    notas: text('notes'),
    supersetKey: text('superset_key'),
  },
  (t) => [uniqueIndex('ux_items_asignacion').on(t.bloqueId, t.posicion)],
);

// ------------------------------------------------------------------ vínculos

export const vinculosPlantilla = relations(plantillas, ({ one, many }) => ({
  coach: one(usuarios, { fields: [plantillas.coachId], references: [usuarios.id] }),
  bloques: many(bloquesPlantilla),
}));

export const vinculosBloquePlantilla = relations(bloquesPlantilla, ({ one, many }) => ({
  plantilla: one(plantillas, {
    fields: [bloquesPlantilla.plantillaId],
    references: [plantillas.id],
  }),
  items: many(itemsPlantilla),
}));

export const vinculosAsignacion = relations(asignaciones, ({ one, many }) => ({
  relacion: one(coachAtleta, {
    fields: [asignaciones.coachAtletaId],
    references: [coachAtleta.id],
  }),
  bloques: many(bloquesAsignacion),
}));

export const vinculosBloqueAsignacion = relations(bloquesAsignacion, ({ one, many }) => ({
  asignacion: one(asignaciones, {
    fields: [bloquesAsignacion.asignacionId],
    references: [asignaciones.id],
  }),
  items: many(itemsAsignacion),
}));

export const catalogo = {
  disciplinas,
  tiposBloque,
  formatosWod,
  ejercicios,
  escaladosEjercicio,
  plantillas,
  bloquesPlantilla,
  itemsPlantilla,
  ciclos,
  asignaciones,
  bloquesAsignacion,
  itemsAsignacion,
  vinculosPlantilla,
  vinculosBloquePlantilla,
  vinculosAsignacion,
  vinculosBloqueAsignacion,
};

export type Ejercicio = typeof ejercicios.$inferSelect;
export type Plantilla = typeof plantillas.$inferSelect;
export type BloquePlantilla = typeof bloquesPlantilla.$inferSelect;
export type ItemPlantilla = typeof itemsPlantilla.$inferSelect;
export type Asignacion = typeof asignaciones.$inferSelect;
export type BloqueAsignacion = typeof bloquesAsignacion.$inferSelect;
export type ItemAsignacion = typeof itemsAsignacion.$inferSelect;
export type TipoBloque = typeof tiposBloque.$inferSelect;
