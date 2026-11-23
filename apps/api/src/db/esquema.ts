/**
 * Esquema de Drizzle. Refleja lo que crean las migraciones de `db/migrations`,
 * que siguen siendo la fuente de verdad: aquí solo describimos las tablas para
 * tener consultas tipadas.
 *
 * Por ahora están las tablas que necesitan autenticación y permisos. Las demás
 * se agregan con su módulo.
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  inet,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export type EstadoRelacion = 'invitada' | 'activa' | 'pausada' | 'archivada';
export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'expirada' | 'cancelada';

export const usuarios = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerificado: boolean('email_verified').notNull().default(false),
    passwordHash: text('password_hash'),
    nombre: text('full_name').notNull(),
    avatarMediaId: uuid('avatar_media_id'),
    locale: text('locale').notNull().default('es-MX'),
    zonaHoraria: text('timezone').notNull().default('America/Mexico_City'),
    unidadPeso: text('units_weight').$type<'kg' | 'lb'>().notNull().default('kg'),
    unidadDistancia: text('units_distance').$type<'km' | 'mi'>().notNull().default('km'),
    vistoEn: timestamp('last_seen_at', { withTimezone: true }),
    creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    borradoEn: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
);

export const perfilesCoach = pgTable('coach_profiles', {
  usuarioId: uuid('user_id').primaryKey().references(() => usuarios.id, { onDelete: 'cascade' }),
  organizacionId: uuid('organization_id'),
  bio: text('bio'),
  disciplinas: text('disciplines').array().notNull().default(sql`'{}'`),
  atletasIncluidos: integer('included_athletes').notNull().default(20),
  creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const perfilesAtleta = pgTable('athlete_profiles', {
  usuarioId: uuid('user_id').primaryKey().references(() => usuarios.id, { onDelete: 'cascade' }),
  anioNacimiento: integer('birth_year'),
  objetivos: text('goals'),
  limitaciones: text('limitations'),
  creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * El eje de toda la autorización. Un atleta puede tener varios coaches, y
 * ninguno ve lo del otro. Cada asignación, hilo y permiso cuelga de aquí.
 */
export const coachAtleta = pgTable(
  'coach_athlete',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coachId: uuid('coach_user_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    atletaId: uuid('athlete_user_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    estado: text('status').$type<EstadoRelacion>().notNull().default('invitada'),
    notasCoach: text('coach_notes'),
    iniciadaEn: timestamp('started_at', { withTimezone: true }),
    terminadaEn: timestamp('ended_at', { withTimezone: true }),
    creadaEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actualizadaEn: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coach_athlete_by_coach').on(t.coachId, t.estado),
    index('coach_athlete_by_athlete').on(t.atletaId, t.estado),
  ],
);

export const invitaciones = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  coachId: uuid('coach_user_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  codigo: text('code').notNull(),
  email: text('email'),
  nombreAtleta: text('athlete_name'),
  estado: text('status').$type<EstadoInvitacion>().notNull().default('pendiente'),
  expiraEn: timestamp('expires_at', { withTimezone: true }).notNull(),
  aceptadaPor: uuid('accepted_by').references(() => usuarios.id),
  creadaEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sesiones = pgTable(
  'sesiones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('user_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familiaId: uuid('familia_id').notNull(),
    reemplazadaPor: uuid('reemplazada_por'),
    userAgent: text('user_agent'),
    ip: inet('ip'),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    revocadaEn: timestamp('revocada_en', { withTimezone: true }),
    usadaEn: timestamp('usada_en', { withTimezone: true }),
    creadaEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sesiones_token_key').on(t.tokenHash), index('sesiones_familia').on(t.familiaId)],
);

export const intentosAcceso = pgTable('intentos_acceso', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),
  ip: inet('ip'),
  exitoso: boolean('exitoso').notNull(),
  creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bitacora = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorId: uuid('actor_user_id'),
  accion: text('action').notNull(),
  entidad: text('entity').notNull(),
  entidadId: uuid('entity_id'),
  sujetoId: uuid('subject_user_id'),
  metadatos: text('metadata'),
  ip: inet('ip'),
  creadoEn: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const relacionesCoachAtleta = relations(coachAtleta, ({ one }) => ({
  coach: one(usuarios, { fields: [coachAtleta.coachId], references: [usuarios.id] }),
  atleta: one(usuarios, { fields: [coachAtleta.atletaId], references: [usuarios.id] }),
}));

export const esquema = {
  usuarios,
  perfilesCoach,
  perfilesAtleta,
  coachAtleta,
  invitaciones,
  sesiones,
  intentosAcceso,
  bitacora,
  relacionesCoachAtleta,
};

export type Usuario = typeof usuarios.$inferSelect;
export type RelacionCoachAtleta = typeof coachAtleta.$inferSelect;
export type Invitacion = typeof invitaciones.$inferSelect;
