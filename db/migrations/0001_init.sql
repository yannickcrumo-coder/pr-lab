-- =====================================================================
-- PR-LAB · 0001_init.sql
-- Esquema inicial. PostgreSQL 16.
--
-- Convenciones:
--   · Claves primarias UUID. La app genera UUID v7 (ordenados en el
--     tiempo); el DEFAULT de abajo es solo red de seguridad.
--   · client_uuid: identificador generado en el dispositivo para que
--     reenviar una operación no duplique nada.
--   · sync_seq: cursor monótono global para la sincronización
--     incremental. El cliente pide "lo que cambió desde N".
--   · Borrado lógico (archived_at / deleted_at). Nada se borra duro si
--     cuelga histórico de un atleta.
--   · Multi-inquilino por fila: cada consulta filtra por la relación
--     coach-atleta. Ver 0003_rls.sql para la segunda barrera.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cursor global de sincronización -------------------------------------
CREATE SEQUENCE sync_seq_global AS bigint START 1;

CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.sync_seq := nextval('sync_seq_global');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;


-- =====================================================================
-- 1. IDENTIDAD
-- =====================================================================

-- Preparado para la Versión 3 (gimnasios). En la Versión 1 queda vacía.
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  plan          text NOT NULL DEFAULT 'beta',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  password_hash   text,                       -- NULL si solo usa Apple o Google
  full_name       text NOT NULL,
  avatar_media_id uuid,                       -- FK se agrega tras crear media
  locale          text NOT NULL DEFAULT 'es-MX',
  timezone        text NOT NULL DEFAULT 'America/Mexico_City',
  units_weight    text NOT NULL DEFAULT 'kg'  CHECK (units_weight IN ('kg','lb')),
  units_distance  text NOT NULL DEFAULT 'km'  CHECK (units_distance IN ('km','mi')),
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Un usuario puede ser coach, atleta o las dos cosas.
CREATE TABLE coach_profiles (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES organizations(id),   -- NULL en la Versión 1
  bio               text,
  disciplines       text[] NOT NULL DEFAULT '{}',
  included_athletes integer NOT NULL DEFAULT 20,         -- los que cubre la mensualidad
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER coach_profiles_touch BEFORE UPDATE ON coach_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE athlete_profiles (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birth_year     integer,                    -- año, no fecha: minimizar dato personal
  goals          text,
  limitations    text,                       -- lesiones y restricciones, lo escribe el atleta
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER athlete_profiles_touch BEFORE UPDATE ON athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =====================================================================
-- 2. RELACIÓN COACH-ATLETA  (el eje de toda la autorización)
-- =====================================================================

CREATE TABLE coach_athlete (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'invitada'
                    CHECK (status IN ('invitada','activa','pausada','archivada')),
  coach_notes     text,                      -- privadas del coach; el atleta no las ve
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (coach_user_id <> athlete_user_id)
);
-- Un atleta puede tener varios coaches, pero una sola relación viva con cada uno.
CREATE UNIQUE INDEX coach_athlete_live_key ON coach_athlete (coach_user_id, athlete_user_id)
  WHERE status IN ('invitada','activa','pausada');
CREATE INDEX coach_athlete_by_coach ON coach_athlete (coach_user_id, status);
CREATE INDEX coach_athlete_by_athlete ON coach_athlete (athlete_user_id, status);
CREATE TRIGGER coach_athlete_touch BEFORE UPDATE ON coach_athlete
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code           text NOT NULL,              -- 6 caracteres para dictar en persona
  email          text,
  athlete_name   text,
  status         text NOT NULL DEFAULT 'pendiente'
                   CHECK (status IN ('pendiente','aceptada','expirada','cancelada')),
  expires_at     timestamptz NOT NULL,
  accepted_by    uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_code_key ON invitations (upper(code))
  WHERE status = 'pendiente';


-- =====================================================================
-- 3. CATÁLOGOS DE REFERENCIA
-- =====================================================================

CREATE TABLE disciplines (
  slug     text PRIMARY KEY,
  name_es  text NOT NULL,
  name_en  text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE equipment (
  slug    text PRIMARY KEY,
  name_es text NOT NULL
);

CREATE TABLE muscles (
  slug        text PRIMARY KEY,
  name_es     text NOT NULL,
  muscle_group text NOT NULL
);

CREATE TABLE block_types (
  slug     text PRIMARY KEY,
  name_es  text NOT NULL,
  tag_es   text NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('ejercicios','texto')),
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE wod_formats (
  slug           text PRIMARY KEY,
  name_es        text NOT NULL,
  description_es text NOT NULL,
  score_type     text NOT NULL,
  lower_is_better boolean NOT NULL DEFAULT false,
  fields         jsonb NOT NULL DEFAULT '[]',
  athlete_logs   jsonb NOT NULL DEFAULT '[]'
);


-- =====================================================================
-- 4. MEDIOS
-- =====================================================================

CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('video','imagen','documento')),
  storage_key   text NOT NULL,
  mime_type     text,
  bytes         bigint,
  duration_s    integer,
  width         integer,
  height        integer,
  status        text NOT NULL DEFAULT 'pendiente'
                  CHECK (status IN ('pendiente','procesando','listo','error')),
  playback_url  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX media_by_owner ON media (owner_user_id, created_at DESC);

ALTER TABLE users
  ADD CONSTRAINT users_avatar_fk FOREIGN KEY (avatar_media_id) REFERENCES media(id);


-- =====================================================================
-- 5. EJERCICIOS  (catálogo público + los del coach, en la misma tabla)
-- =====================================================================

CREATE TABLE exercises (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL,
  name_es            text NOT NULL,
  name_en            text,
  aliases_es         text[] NOT NULL DEFAULT '{}',
  disciplines        text[] NOT NULL DEFAULT '{}',
  pattern            text,
  primary_muscles    text[] NOT NULL DEFAULT '{}',
  secondary_muscles  text[] NOT NULL DEFAULT '{}',
  equipment          text[] NOT NULL DEFAULT '{}',
  metrics            text[] NOT NULL DEFAULT '{reps}',   -- qué registra el atleta
  unilateral         boolean NOT NULL DEFAULT false,
  level              text CHECK (level IN ('principiante','intermedio','avanzado')),
  tracks_one_rep_max boolean NOT NULL DEFAULT false,
  cue_es             text,
  video_media_id     uuid REFERENCES media(id),
  -- Propiedad: NULL + is_public = catálogo; coach + privado = suyo.
  is_public          boolean NOT NULL DEFAULT false,
  owner_coach_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  source             text NOT NULL DEFAULT 'coach' CHECK (source IN ('seed','coach')),
  status             text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','archivado')),
  sync_seq           bigint NOT NULL DEFAULT nextval('sync_seq_global'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercises_ownership CHECK (
    (is_public AND owner_coach_id IS NULL) OR (NOT is_public AND owner_coach_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX exercises_public_slug ON exercises (slug) WHERE is_public;
CREATE UNIQUE INDEX exercises_coach_slug ON exercises (owner_coach_id, slug) WHERE NOT is_public;
CREATE INDEX exercises_by_coach ON exercises (owner_coach_id) WHERE owner_coach_id IS NOT NULL;
CREATE INDEX exercises_disciplines_gin ON exercises USING gin (disciplines);
CREATE INDEX exercises_equipment_gin ON exercises USING gin (equipment);
CREATE INDEX exercises_muscles_gin ON exercises USING gin (primary_muscles);
CREATE INDEX exercises_name_trgm ON exercises USING gin (name_es gin_trgm_ops);
CREATE TRIGGER exercises_touch BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- Escalamientos entre ejercicios (más fácil / más difícil)
CREATE TABLE exercise_scalings (
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  direction   text NOT NULL CHECK (direction IN ('mas_facil','mas_dificil')),
  PRIMARY KEY (exercise_id, target_id, direction),
  CHECK (exercise_id <> target_id)
);

-- Valida que los vocabularios existan, ya que un array no admite llave foránea.
CREATE OR REPLACE FUNCTION validate_exercise_vocab() RETURNS trigger AS $$
DECLARE missing text;
BEGIN
  SELECT d INTO missing FROM unnest(NEW.disciplines) d
    WHERE NOT EXISTS (SELECT 1 FROM disciplines WHERE slug = d) LIMIT 1;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'disciplina desconocida: %', missing;
  END IF;
  SELECT e INTO missing FROM unnest(NEW.equipment) e
    WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE slug = e) LIMIT 1;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'equipo desconocido: %', missing;
  END IF;
  SELECT m INTO missing FROM unnest(NEW.primary_muscles || NEW.secondary_muscles) m
    WHERE NOT EXISTS (SELECT 1 FROM muscles WHERE slug = m) LIMIT 1;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'músculo desconocido: %', missing;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER exercises_vocab BEFORE INSERT OR UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION validate_exercise_vocab();


-- =====================================================================
-- 6. PLANTILLAS  (lo que el coach reutiliza)
-- =====================================================================

CREATE TABLE templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  discipline     text REFERENCES disciplines(slug),
  scope          text NOT NULL DEFAULT 'dia' CHECK (scope IN ('dia','semana','ciclo')),
  description    text,
  status         text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','archivada')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX templates_by_coach ON templates (owner_coach_id, status);
CREATE TRIGGER templates_touch BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE template_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  block_type  text NOT NULL REFERENCES block_types(slug),
  title       text,
  -- Para el bloque White Board: el texto libre que escribe el coach.
  body_text   text,
  wod_format  text REFERENCES wod_formats(slug),
  config      jsonb NOT NULL DEFAULT '{}',    -- duración, rondas, cap, etc.
  day_offset  integer NOT NULL DEFAULT 0,     -- para plantillas de semana o ciclo
  UNIQUE (template_id, day_offset, position)
);

CREATE TABLE template_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     uuid NOT NULL REFERENCES template_blocks(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  exercise_id  uuid NOT NULL REFERENCES exercises(id),
  prescription jsonb NOT NULL DEFAULT '{}',   -- series, reps, carga, RPE, tiempo…
  notes        text,
  superset_key text,                          -- mismo valor = mismo superset
  UNIQUE (block_id, position)
);


-- =====================================================================
-- 7. CICLOS Y ASIGNACIONES  (la copia congelada)
-- =====================================================================

CREATE TABLE cycles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_athlete_id uuid NOT NULL REFERENCES coach_athlete(id) ON DELETE CASCADE,
  name             text NOT NULL,
  goal             text,
  starts_on        date NOT NULL,
  ends_on          date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX cycles_by_rel ON cycles (coach_athlete_id, starts_on);

-- Una asignación es una sesión puesta en un día concreto de un atleta.
-- Sus bloques e ítems son COPIA de la plantilla, no referencia: editar la
-- plantilla después no cambia lo ya asignado.
CREATE TABLE assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_athlete_id  uuid NOT NULL REFERENCES coach_athlete(id) ON DELETE CASCADE,
  cycle_id          uuid REFERENCES cycles(id) ON DELETE SET NULL,
  source_template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  title             text NOT NULL,
  discipline        text REFERENCES disciplines(slug),
  scheduled_date    date NOT NULL,            -- fecha LOCAL del atleta
  athlete_timezone  text NOT NULL,            -- con la que se calculó esa fecha
  status            text NOT NULL DEFAULT 'borrador'
                      CHECK (status IN ('borrador','publicada','completada','parcial','omitida')),
  version           integer NOT NULL DEFAULT 1,
  coach_note        text,
  published_at      timestamptz,
  sync_seq          bigint NOT NULL DEFAULT nextval('sync_seq_global'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  CHECK (status = 'borrador' OR published_at IS NOT NULL)
);
CREATE INDEX assignments_calendar ON assignments (coach_athlete_id, scheduled_date)
  WHERE archived_at IS NULL;
CREATE INDEX assignments_sync ON assignments (coach_athlete_id, sync_seq);
CREATE TRIGGER assignments_touch BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION touch_row();

CREATE TABLE assignment_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  block_type    text NOT NULL REFERENCES block_types(slug),
  title         text,
  body_text     text,                          -- White Board
  wod_format    text REFERENCES wod_formats(slug),
  config        jsonb NOT NULL DEFAULT '{}',
  UNIQUE (assignment_id, position)
);

CREATE TABLE assignment_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     uuid NOT NULL REFERENCES assignment_blocks(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  exercise_id  uuid NOT NULL REFERENCES exercises(id),
  prescription jsonb NOT NULL DEFAULT '{}',
  notes        text,
  superset_key text,
  UNIQUE (block_id, position)
);
CREATE INDEX assignment_items_by_exercise ON assignment_items (exercise_id);


-- =====================================================================
-- 8. EJECUCIÓN  (lo que el atleta registra)
-- =====================================================================

CREATE TABLE workout_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid REFERENCES assignments(id) ON DELETE SET NULL,
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_uuid     uuid NOT NULL,              -- idempotencia desde el dispositivo
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  session_rpe     numeric(3,1) CHECK (session_rpe BETWEEN 0 AND 10),
  notes           text,
  status          text NOT NULL DEFAULT 'en_curso'
                    CHECK (status IN ('en_curso','completada','parcial','abandonada')),
  source          text NOT NULL DEFAULT 'app' CHECK (source IN ('app','reloj','coach','importado')),
  sync_seq        bigint NOT NULL DEFAULT nextval('sync_seq_global'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workout_logs_client_key ON workout_logs (athlete_user_id, client_uuid);
CREATE INDEX workout_logs_by_athlete ON workout_logs (athlete_user_id, started_at DESC);
CREATE INDEX workout_logs_sync ON workout_logs (athlete_user_id, sync_seq);
CREATE TRIGGER workout_logs_touch BEFORE UPDATE ON workout_logs
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- Una serie de fuerza, un tramo de Hyrox o un intervalo: todos caben aquí.
-- Nota de escala: particionar por completed_at cuando pase de ~50 M filas.
CREATE TABLE set_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id     uuid NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  assignment_item_id uuid REFERENCES assignment_items(id) ON DELETE SET NULL,
  exercise_id        uuid NOT NULL REFERENCES exercises(id),
  client_uuid        uuid NOT NULL,
  set_number         integer NOT NULL,
  reps               integer,
  load_kg            numeric(7,2),             -- siempre en kg; se convierte al mostrar
  rpe                numeric(3,1) CHECK (rpe BETWEEN 0 AND 10),
  duration_s         integer,
  distance_m         numeric(10,2),
  calories           integer,
  heart_rate_avg     integer,
  power_avg_w        integer,
  is_warmup          boolean NOT NULL DEFAULT false,
  completed_at       timestamptz NOT NULL DEFAULT now(),
  sync_seq           bigint NOT NULL DEFAULT nextval('sync_seq_global')
);
CREATE UNIQUE INDEX set_logs_client_key ON set_logs (workout_log_id, client_uuid);
CREATE INDEX set_logs_progress ON set_logs (exercise_id, completed_at DESC);
CREATE INDEX set_logs_by_workout ON set_logs (workout_log_id, set_number);

-- Resultado de un bloque que no se registra serie por serie:
-- un White Board, un AMRAP, una simulación completa.
CREATE TABLE block_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id      uuid NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  assignment_block_id uuid REFERENCES assignment_blocks(id) ON DELETE SET NULL,
  client_uuid         uuid NOT NULL,
  result_text         text,                    -- lo que el atleta escribe
  duration_s          integer,
  rounds              integer,
  reps                integer,
  rpe                 numeric(3,1) CHECK (rpe BETWEEN 0 AND 10),
  splits              jsonb,                   -- parciales por tramo, en Hyrox
  completed_at        timestamptz NOT NULL DEFAULT now(),
  sync_seq            bigint NOT NULL DEFAULT nextval('sync_seq_global')
);
CREATE UNIQUE INDEX block_logs_client_key ON block_logs (workout_log_id, client_uuid);

CREATE TABLE pain_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_log_id  uuid REFERENCES workout_logs(id) ON DELETE SET NULL,
  exercise_id     uuid REFERENCES exercises(id),
  body_area       text NOT NULL,
  intensity       integer NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  note            text,
  client_uuid     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  sync_seq        bigint NOT NULL DEFAULT nextval('sync_seq_global')
);
CREATE INDEX pain_reports_by_athlete ON pain_reports (athlete_user_id, created_at DESC);

CREATE TABLE personal_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id     uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  metric          text NOT NULL,              -- 1rm_estimado, max_reps, mejor_tiempo…
  value           numeric(12,3) NOT NULL,
  unit            text NOT NULL,
  achieved_at     timestamptz NOT NULL,
  workout_log_id  uuid REFERENCES workout_logs(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prs_by_athlete ON personal_records (athlete_user_id, exercise_id, metric, achieved_at DESC);

CREATE TABLE body_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on     date NOT NULL,
  weight_kg       numeric(6,2),
  body_fat_pct    numeric(4,1),
  measurements    jsonb NOT NULL DEFAULT '{}',
  photo_media_id  uuid REFERENCES media(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_user_id, measured_on)
);

-- Umbrales del atleta: de aquí salen las zonas de la prescripción.
CREATE TABLE athlete_thresholds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('fc_max','fc_umbral','ftp','ritmo_umbral','1rm')),
  exercise_id     uuid REFERENCES exercises(id),   -- solo para 1rm
  value           numeric(10,2) NOT NULL,
  unit            text NOT NULL,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  set_by_user_id  uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX thresholds_current ON athlete_thresholds (athlete_user_id, kind, effective_from DESC);


-- =====================================================================
-- 9. CUMPLIMIENTO  (precalculado para que los dashboards sean rápidos)
-- =====================================================================

CREATE TABLE compliance_weekly (
  coach_athlete_id uuid NOT NULL REFERENCES coach_athlete(id) ON DELETE CASCADE,
  week_start       date NOT NULL,
  planned          integer NOT NULL DEFAULT 0,
  completed        integer NOT NULL DEFAULT 0,
  partial          integer NOT NULL DEFAULT 0,
  skipped          integer NOT NULL DEFAULT 0,
  pct              numeric(5,2) NOT NULL DEFAULT 0,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_athlete_id, week_start)
);


-- =====================================================================
-- 10. MENSAJERÍA
-- =====================================================================

CREATE TABLE threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_athlete_id uuid NOT NULL REFERENCES coach_athlete(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_athlete_id)
);

CREATE TABLE messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           text,
  media_id       uuid REFERENCES media(id),
  assignment_id  uuid REFERENCES assignments(id) ON DELETE SET NULL,  -- cita una sesión
  exercise_id    uuid REFERENCES exercises(id),
  client_uuid    uuid NOT NULL,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  sync_seq       bigint NOT NULL DEFAULT nextval('sync_seq_global'),
  CHECK (body IS NOT NULL OR media_id IS NOT NULL)
);
CREATE UNIQUE INDEX messages_client_key ON messages (thread_id, client_uuid);
CREATE INDEX messages_thread_time ON messages (thread_id, created_at DESC);
CREATE INDEX messages_sync ON messages (thread_id, sync_seq);


-- =====================================================================
-- 11. INTEGRACIONES CON RELOJES
-- =====================================================================

CREATE TABLE provider_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           text NOT NULL
                       CHECK (provider IN ('suunto','coros','strava','garmin',
                                           'health_kit','health_connect','archivo_fit')),
  status             text NOT NULL DEFAULT 'activa'
                       CHECK (status IN ('activa','expirada','revocada','error')),
  external_user_id   text,
  access_token_enc   bytea,                   -- cifrado en la aplicación
  refresh_token_enc  bytea,
  token_expires_at   timestamptz,
  scopes             text[] NOT NULL DEFAULT '{}',
  last_sync_at       timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX provider_conn_key ON provider_connections (athlete_user_id, provider)
  WHERE status <> 'revocada';

-- Consentimiento granular: qué fuente comparte el atleta con cada coach.
CREATE TABLE provider_sharing (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  coach_athlete_id       uuid NOT NULL REFERENCES coach_athlete(id) ON DELETE CASCADE,
  shared                 boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, coach_athlete_id)
);

CREATE TABLE activities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  source_activity_id  text NOT NULL,
  -- 'solo_atleta' lo exigen los términos de Strava: el coach no lo ve.
  visibility          text NOT NULL DEFAULT 'compartible'
                        CHECK (visibility IN ('compartible','solo_atleta')),
  ai_excluded         boolean NOT NULL DEFAULT false,
  sport               text NOT NULL,
  started_at          timestamptz NOT NULL,
  duration_s          integer NOT NULL,
  distance_m          numeric(10,2),
  elevation_gain_m    numeric(8,2),
  avg_heart_rate      integer,
  max_heart_rate      integer,
  avg_power_w         integer,
  avg_pace_s_per_km   numeric(8,2),
  calories            integer,
  laps                jsonb,
  zones               jsonb,
  linked_assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  dedupe_group_id     uuid,                    -- misma actividad por dos fuentes
  raw_media_id        uuid REFERENCES media(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  sync_seq            bigint NOT NULL DEFAULT nextval('sync_seq_global')
);
CREATE UNIQUE INDEX activities_source_key ON activities (provider, source_activity_id);
CREATE INDEX activities_by_athlete ON activities (athlete_user_id, started_at DESC);
CREATE INDEX activities_dedupe ON activities (dedupe_group_id) WHERE dedupe_group_id IS NOT NULL;


-- =====================================================================
-- 12. NOTIFICACIONES Y AUDITORÍA
-- =====================================================================

CREATE TABLE device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('ios','android','web')),
  token        text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, token)
);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  scheduled_for timestamptz,
  sent_at       timestamptz,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_pending ON notifications (scheduled_for)
  WHERE sent_at IS NULL;

-- Toda lectura o cambio sobre datos de salud deja rastro.
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     uuid,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata      jsonb NOT NULL DEFAULT '{}',
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_by_subject ON audit_log (subject_user_id, created_at DESC);


-- =====================================================================
-- 13. VERSIÓN 2  (se crean vacías para no migrar después)
-- =====================================================================

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           text,
  external_id        text,
  plan               text NOT NULL DEFAULT 'base',
  athlete_packs      integer NOT NULL DEFAULT 0,   -- paquetes de 50 adicionales
  status             text NOT NULL DEFAULT 'prueba'
                       CHECK (status IN ('prueba','activa','vencida','cancelada')),
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_kind    text,
  context_id      uuid,
  consent_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('usuario','asistente','sistema')),
  content         text NOT NULL,
  model           text,
  tokens_in       integer,
  tokens_out      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
-- 14. VISTAS DE APOYO
-- =====================================================================

-- Atletas activos por coach: la cuenta del modelo de cobro.
CREATE VIEW coach_athlete_counts AS
SELECT ca.coach_user_id,
       count(*) FILTER (WHERE ca.status = 'activa')   AS activos,
       count(*) FILTER (WHERE ca.status = 'invitada') AS invitados
FROM coach_athlete ca
GROUP BY ca.coach_user_id;

-- Qué ve un coach de un atleta: solo lo suyo, y solo lo que el atleta comparte.
CREATE VIEW coach_visible_activities AS
SELECT a.*, ca.coach_user_id
FROM activities a
JOIN coach_athlete ca ON ca.athlete_user_id = a.athlete_user_id AND ca.status = 'activa'
JOIN provider_connections pc
  ON pc.athlete_user_id = a.athlete_user_id AND pc.provider = a.provider
JOIN provider_sharing ps
  ON ps.provider_connection_id = pc.id AND ps.coach_athlete_id = ca.id AND ps.shared
WHERE a.visibility = 'compartible';
