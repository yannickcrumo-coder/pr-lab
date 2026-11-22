-- =====================================================================
-- PR-LAB · pruebas de humo del esquema
-- Verifica las reglas que el producto no puede permitirse romper.
-- Uso:  psql -v ON_ERROR_STOP=1 -f tests/smoke.sql
-- Cualquier fallo aborta con error.
-- =====================================================================

\set QUIET on
SET client_min_messages TO notice;

-- ---------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------
INSERT INTO users (id, email, full_name) VALUES
  ('11111111-1111-4111-8111-111111111111','ana@prlab.test','Ana Rivera'),
  ('22222222-2222-4222-8222-222222222222','luis@prlab.test','Luis Mendoza'),
  ('33333333-3333-4333-8333-333333333333','diego@prlab.test','Diego Salas'),
  ('44444444-4444-4444-8444-444444444444','mariana@prlab.test','Mariana Ortiz');

INSERT INTO coach_profiles (user_id, disciplines) VALUES
  ('11111111-1111-4111-8111-111111111111', ARRAY['fuerza']),
  ('22222222-2222-4222-8222-222222222222', ARRAY['hyrox']);
INSERT INTO athlete_profiles (user_id) VALUES
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

-- Diego tiene DOS coaches. Ana tiene además a Mariana.
INSERT INTO coach_athlete (id, coach_user_id, athlete_user_id, status, started_at) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333','activa', now()),
  ('aaaaaaaa-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333','activa', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444','activa', now());

-- ---------------------------------------------------------------------
-- 1 · Un atleta puede tener varios coaches
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM coach_athlete
   WHERE athlete_user_id = '33333333-3333-4333-8333-333333333333' AND status = 'activa';
  IF n <> 2 THEN RAISE EXCEPTION 'FALLO 1: Diego deberia tener 2 coaches, tiene %', n; END IF;
  RAISE NOTICE 'OK  1 · un atleta con dos coaches';
END $$;

-- ---------------------------------------------------------------------
-- 2 · No se permite una segunda relacion viva con el mismo coach
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO coach_athlete (coach_user_id, athlete_user_id, status)
    VALUES ('11111111-1111-4111-8111-111111111111',
            '33333333-3333-4333-8333-333333333333','activa');
    RAISE EXCEPTION 'FALLO 2: se permitio relacion duplicada';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK  2 · relacion duplicada rechazada';
  END;
END $$;

-- ---------------------------------------------------------------------
-- 3 · Una sesion publicada exige fecha de publicacion
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO assignments (coach_athlete_id, title, scheduled_date,
                             athlete_timezone, status)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','Mala','2026-11-21',
            'America/Mexico_City','publicada');
    RAISE EXCEPTION 'FALLO 3: se publico sin published_at';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK  3 · publicar sin fecha de publicacion rechazado';
  END;
END $$;

-- ---------------------------------------------------------------------
-- Plantilla de Ana, con un bloque de fuerza y un White Board
-- ---------------------------------------------------------------------
INSERT INTO templates (id, owner_coach_id, name, discipline, scope) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Fuerza · Dia A','fuerza','dia');

INSERT INTO template_blocks (id, template_id, position, block_type, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000011','bbbbbbbb-0000-4000-8000-000000000001',
   1,'fuerza','Fuerza');
INSERT INTO template_blocks (id, template_id, position, block_type, body_text) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000012','bbbbbbbb-0000-4000-8000-000000000001',
   2,'white_board', E'AMRAP 12 min\n10 thrusters 43 kg\n15 wall balls');

INSERT INTO template_items (block_id, position, exercise_id, prescription)
SELECT 'bbbbbbbb-0000-4000-8000-000000000011', 1, id,
       '{"series":5,"reps":5,"carga_kg":100,"rpe":8,"descanso_s":120}'::jsonb
FROM exercises WHERE slug = 'sentadilla-trasera' AND is_public;

-- ---------------------------------------------------------------------
-- 4 · El White Board no necesita ejercicios
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM template_items
   WHERE block_id = 'bbbbbbbb-0000-4000-8000-000000000012';
  IF n <> 0 THEN RAISE EXCEPTION 'FALLO 4: el White Board no deberia tener items'; END IF;
  PERFORM 1 FROM template_blocks
   WHERE id = 'bbbbbbbb-0000-4000-8000-000000000012' AND body_text IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'FALLO 4: el White Board perdio su texto'; END IF;
  RAISE NOTICE 'OK  4 · bloque White Board de texto libre, sin ejercicios';
END $$;

-- ---------------------------------------------------------------------
-- Asignar = copiar la plantilla (congelar), no referenciarla
-- ---------------------------------------------------------------------
INSERT INTO assignments (id, coach_athlete_id, source_template_id, title, discipline,
                         scheduled_date, athlete_timezone, status, published_at)
VALUES ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',
        'bbbbbbbb-0000-4000-8000-000000000001','Fuerza · Dia A','fuerza',
        '2026-11-21','America/Mexico_City','publicada', now());

INSERT INTO assignment_blocks (id, assignment_id, position, block_type, title, body_text)
SELECT gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001',
       tb.position, tb.block_type, tb.title, tb.body_text
FROM template_blocks tb WHERE tb.template_id = 'bbbbbbbb-0000-4000-8000-000000000001';

INSERT INTO assignment_items (block_id, position, exercise_id, prescription)
SELECT ab.id, ti.position, ti.exercise_id, ti.prescription
FROM template_items ti
JOIN template_blocks tb ON tb.id = ti.block_id
JOIN assignment_blocks ab ON ab.assignment_id = 'cccccccc-0000-4000-8000-000000000001'
                         AND ab.position = tb.position
WHERE tb.template_id = 'bbbbbbbb-0000-4000-8000-000000000001';

-- Ahora el coach cambia la plantilla: 110 kg en vez de 100
UPDATE template_items
   SET prescription = jsonb_set(prescription, '{carga_kg}', '110')
 WHERE block_id = 'bbbbbbbb-0000-4000-8000-000000000011';

-- ---------------------------------------------------------------------
-- 5 · Editar la plantilla NO cambia lo ya asignado
-- ---------------------------------------------------------------------
DO $$
DECLARE carga numeric;
BEGIN
  SELECT (ai.prescription->>'carga_kg')::numeric INTO carga
  FROM assignment_items ai
  JOIN assignment_blocks ab ON ab.id = ai.block_id
  WHERE ab.assignment_id = 'cccccccc-0000-4000-8000-000000000001' LIMIT 1;
  IF carga <> 100 THEN
    RAISE EXCEPTION 'FALLO 5: la asignacion cambio con la plantilla (carga = %)', carga;
  END IF;
  RAISE NOTICE 'OK  5 · copia congelada: la asignacion sigue en 100 kg';
END $$;

-- ---------------------------------------------------------------------
-- Diego registra su entrenamiento
-- ---------------------------------------------------------------------
INSERT INTO workout_logs (id, assignment_id, athlete_user_id, client_uuid,
                          started_at, finished_at, session_rpe, status)
VALUES ('dddddddd-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001',
        '33333333-3333-4333-8333-333333333333','eeeeeeee-0000-4000-8000-000000000001',
        now() - interval '1 hour', now(), 8.0, 'completada');

INSERT INTO set_logs (workout_log_id, assignment_item_id, exercise_id, client_uuid,
                      set_number, reps, load_kg, rpe)
SELECT 'dddddddd-0000-4000-8000-000000000001', ai.id, ai.exercise_id,
       ('eeeeeeee-0000-4000-8000-00000000000' || s)::uuid, s, 5, 100, 8
FROM assignment_items ai
JOIN assignment_blocks ab ON ab.id = ai.block_id
CROSS JOIN generate_series(2, 6) s
WHERE ab.assignment_id = 'cccccccc-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------
-- 6 · Reenviar la misma operacion no duplica (idempotencia)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO set_logs (workout_log_id, exercise_id, client_uuid, set_number, reps, load_kg)
    SELECT 'dddddddd-0000-4000-8000-000000000001', exercise_id,
           'eeeeeeee-0000-4000-8000-000000000002', 2, 5, 100
    FROM set_logs WHERE workout_log_id = 'dddddddd-0000-4000-8000-000000000001' LIMIT 1;
    RAISE EXCEPTION 'FALLO 6: se duplico una serie con el mismo client_uuid';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK  6 · reenvio con el mismo client_uuid rechazado';
  END;
END $$;

-- ---------------------------------------------------------------------
-- 7 · Aislamiento entre coaches del mismo atleta
-- ---------------------------------------------------------------------
INSERT INTO assignments (coach_athlete_id, title, discipline, scheduled_date,
                         athlete_timezone, status, published_at)
VALUES ('aaaaaaaa-0000-4000-8000-000000000002','Test de Hyrox al 50 %','hyrox',
        '2026-11-21','America/Mexico_City','publicada', now());

DO $$
DECLARE n_ana int; n_luis int; n_diego int;
BEGIN
  SELECT count(*) INTO n_ana FROM assignments a
   JOIN coach_athlete ca ON ca.id = a.coach_athlete_id
   WHERE ca.coach_user_id = '11111111-1111-4111-8111-111111111111'
     AND ca.athlete_user_id = '33333333-3333-4333-8333-333333333333';
  SELECT count(*) INTO n_luis FROM assignments a
   JOIN coach_athlete ca ON ca.id = a.coach_athlete_id
   WHERE ca.coach_user_id = '22222222-2222-4222-8222-222222222222'
     AND ca.athlete_user_id = '33333333-3333-4333-8333-333333333333';
  SELECT count(*) INTO n_diego FROM assignments a
   JOIN coach_athlete ca ON ca.id = a.coach_athlete_id
   WHERE ca.athlete_user_id = '33333333-3333-4333-8333-333333333333';
  IF n_ana <> 1 OR n_luis <> 1 OR n_diego <> 2 THEN
    RAISE EXCEPTION 'FALLO 7: aislamiento roto (ana=%, luis=%, diego=%)',
      n_ana, n_luis, n_diego;
  END IF;
  RAISE NOTICE 'OK  7 · cada coach ve 1 sesion; el atleta ve las 2';
END $$;

-- ---------------------------------------------------------------------
-- 8 · Un ejercicio del coach es privado y no choca con el catalogo
-- ---------------------------------------------------------------------
INSERT INTO exercises (slug, name_es, metrics, primary_muscles, equipment, disciplines,
                       is_public, owner_coach_id, source)
VALUES ('sentadilla-trasera','Sentadilla trasera con cadena', ARRAY['reps','load'],
        ARRAY['cuadriceps'], ARRAY['barra'], ARRAY['fuerza'],
        false, '11111111-1111-4111-8111-111111111111','coach');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM exercises WHERE slug = 'sentadilla-trasera';
  IF n <> 2 THEN RAISE EXCEPTION 'FALLO 8: deberia haber 2 filas con ese slug, hay %', n; END IF;
  BEGIN
    INSERT INTO exercises (slug, name_es, is_public, owner_coach_id)
    VALUES ('otro','Otro', true, '11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'FALLO 8: se permitio publico con dueno';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK  8 · ejercicio del coach privado; publico con dueno rechazado';
  END;
END $$;

-- ---------------------------------------------------------------------
-- 9 · Vocabularios validados
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO exercises (slug, name_es, disciplines, is_public, owner_coach_id)
    VALUES ('inventado','Inventado', ARRAY['parkour'], false,
            '11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'FALLO 9: se acepto una disciplina inexistente';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK  9 · disciplina inexistente rechazada (%)', SQLERRM;
  END;
END $$;

-- ---------------------------------------------------------------------
-- 10 · Strava: visible para el atleta, no para el coach
-- ---------------------------------------------------------------------
INSERT INTO provider_connections (id, athlete_user_id, provider, status) VALUES
  ('ffffffff-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333',
   'strava','activa'),
  ('ffffffff-0000-4000-8000-000000000002','33333333-3333-4333-8333-333333333333',
   'suunto','activa');
-- Diego comparte las dos fuentes con Ana
INSERT INTO provider_sharing (provider_connection_id, coach_athlete_id, shared) VALUES
  ('ffffffff-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001', true),
  ('ffffffff-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001', true);

INSERT INTO activities (athlete_user_id, provider, source_activity_id, visibility,
                        ai_excluded, sport, started_at, duration_s, distance_m) VALUES
  ('33333333-3333-4333-8333-333333333333','strava','s-1','solo_atleta', true,
   'run', now(), 2400, 8000),
  ('33333333-3333-4333-8333-333333333333','suunto','u-1','compartible', false,
   'run', now(), 2400, 8000);

DO $$
DECLARE n_coach int; n_atleta int; n_ia int;
BEGIN
  SELECT count(*) INTO n_coach FROM coach_visible_activities
   WHERE coach_user_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_atleta FROM activities
   WHERE athlete_user_id = '33333333-3333-4333-8333-333333333333';
  SELECT count(*) INTO n_ia FROM activities
   WHERE athlete_user_id = '33333333-3333-4333-8333-333333333333' AND NOT ai_excluded;
  IF n_atleta <> 2 OR n_coach <> 1 OR n_ia <> 1 THEN
    RAISE EXCEPTION 'FALLO 10: visibilidad incorrecta (coach=%, atleta=%, ia=%)',
      n_coach, n_atleta, n_ia;
  END IF;
  RAISE NOTICE 'OK 10 · el atleta ve 2 actividades, el coach 1, la IA 1';
END $$;

-- ---------------------------------------------------------------------
-- 11 · El cursor de sincronizacion avanza al actualizar
-- ---------------------------------------------------------------------
DO $$
DECLARE antes bigint; despues bigint;
BEGIN
  SELECT sync_seq INTO antes FROM assignments
   WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  UPDATE assignments SET coach_note = 'Cuida la profundidad'
   WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  SELECT sync_seq INTO despues FROM assignments
   WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  IF despues <= antes THEN
    RAISE EXCEPTION 'FALLO 11: sync_seq no avanzo (% -> %)', antes, despues;
  END IF;
  RAISE NOTICE 'OK 11 · sync_seq avanzo de % a %', antes, despues;
END $$;

-- ---------------------------------------------------------------------
-- 12 · Conteo de atletas activos por coach (base del cobro)
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT activos INTO n FROM coach_athlete_counts
   WHERE coach_user_id = '11111111-1111-4111-8111-111111111111';
  IF n <> 2 THEN RAISE EXCEPTION 'FALLO 12: Ana deberia tener 2 activos, tiene %', n; END IF;
  RAISE NOTICE 'OK 12 · conteo de atletas activos por coach';
END $$;

-- ---------------------------------------------------------------------
-- 13 · El historico sobrevive al archivar un ejercicio del coach
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  UPDATE exercises SET status = 'archivado'
   WHERE owner_coach_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n FROM set_logs
   WHERE workout_log_id = 'dddddddd-0000-4000-8000-000000000001';
  IF n <> 5 THEN RAISE EXCEPTION 'FALLO 13: se perdieron series (%)', n; END IF;
  RAISE NOTICE 'OK 13 · archivar no rompe el historico (5 series intactas)';
END $$;

DO $$ BEGIN RAISE NOTICE '--- 13 pruebas pasaron ---'; END $$;
