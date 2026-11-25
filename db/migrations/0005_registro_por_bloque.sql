-- 0005 — Un solo resultado por bloque por sesión.
--
-- El cuadro de texto donde el atleta anota su resultado al final de cada
-- bloque ya tenía su lugar desde la migración inicial: `block_logs`, con
-- `result_text` para lo que escribe y `duration_s`, `rounds`, `reps`, `rpe` y
-- `splits` para la parte estructurada que sí se puede graficar. No hace falta
-- tabla nueva.
--
-- Lo que falta es una garantía. El índice único que hay es
-- `(workout_log_id, client_uuid)`: eso da la idempotencia de la cola (regla 2),
-- o sea que reenviar el mismo registro tras un corte de red no duplica. Pero
-- no impide DOS registros distintos del mismo bloque:
--
--   el atleta anota su WOD, reinstala la app, pierde el estado local, vuelve a
--   anotarlo con otro client_uuid, y la sesión queda con dos resultados para
--   el mismo bloque. La pantalla tendría que elegir uno, y elegiría mal la
--   mitad de las veces.
--
-- Con este índice ese segundo insert falla y el cliente tiene que resolverlo
-- como lo que es: una corrección del registro que ya existe.
--
-- OJO AL ESCRIBIR ESE UPSERT. El índice es PARCIAL, y PostgreSQL exige que la
-- cláusula ON CONFLICT repita su predicado o no lo reconoce:
--
--   -- falla con «there is no unique or exclusion constraint matching»
--   ON CONFLICT (workout_log_id, assignment_block_id) DO UPDATE …
--
--   -- así sí
--   ON CONFLICT (workout_log_id, assignment_block_id)
--     WHERE assignment_block_id IS NOT NULL DO UPDATE …
--
-- Probado contra una base real; está en db/tests/smoke.sql.
--
-- Es parcial porque un bloque que el coach borró después deja el registro con
-- `assignment_block_id` en NULL (ON DELETE SET NULL, regla 4: el registro del
-- atleta no se va con el bloque). Esos huérfanos no deben estorbarse entre sí.

CREATE UNIQUE INDEX block_logs_uno_por_bloque
  ON block_logs (workout_log_id, assignment_block_id)
  WHERE assignment_block_id IS NOT NULL;

COMMENT ON INDEX block_logs_uno_por_bloque IS
  'Un resultado por bloque por sesión. Una segunda anotación del mismo bloque es una corrección: ON CONFLICT DO UPDATE.';
