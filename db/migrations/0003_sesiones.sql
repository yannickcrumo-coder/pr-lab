-- =====================================================================
-- PR-LAB · 0003_sesiones.sql
-- Sesiones de refresco y control de intentos de inicio de sesión.
--
-- El token de acceso vive 15 minutos y no se guarda en ningún lado.
-- El de refresco sí se guarda, pero solo su huella: si alguien se roba
-- la base, no puede usarlos. Cada uso rota el token y marca el anterior
-- como reemplazado, así que reusar uno viejo delata un robo.
-- =====================================================================

CREATE TABLE sesiones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     text NOT NULL,            -- SHA-256 del token, nunca el token
  familia_id     uuid NOT NULL,            -- todas las rotaciones de una misma sesión
  reemplazada_por uuid REFERENCES sesiones(id) ON DELETE SET NULL,
  user_agent     text,
  ip             inet,
  expira_en      timestamptz NOT NULL,
  revocada_en    timestamptz,
  usada_en       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sesiones_token_key ON sesiones (token_hash);
CREATE INDEX sesiones_por_usuario ON sesiones (user_id, created_at DESC);
CREATE INDEX sesiones_familia ON sesiones (familia_id);
CREATE INDEX sesiones_vencidas ON sesiones (expira_en) WHERE revocada_en IS NULL;

-- Intentos fallidos, para frenar fuerza bruta sin bloquear al usuario real.
CREATE TABLE intentos_acceso (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip          inet,
  exitoso     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intentos_por_email ON intentos_acceso (lower(email), created_at DESC);
CREATE INDEX intentos_por_ip ON intentos_acceso (ip, created_at DESC);

-- Control de qué migraciones ya se aplicaron en esta base.
CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
  nombre     text PRIMARY KEY,
  huella     text NOT NULL,              -- SHA-256 del archivo al aplicarlo
  aplicada_en timestamptz NOT NULL DEFAULT now()
);
