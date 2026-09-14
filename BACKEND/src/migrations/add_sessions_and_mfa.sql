-- Sesiones reales (revocables) + endurecimiento del MFA.
-- Idempotente. En desarrollo lo crea TypeORM (synchronize); esto es para producción.

-- ── Columnas nuevas de usuario ──────────────────────────────────────────
ALTER TABLE tbl_users
  ADD COLUMN IF NOT EXISTS int_two_factor_last_step      BIGINT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS json_two_factor_backup_codes  JSONB       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dat_backup_codes_generated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS int_failed_login_attempts     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dat_locked_until              TIMESTAMPTZ DEFAULT NULL;

-- ── Sesiones ────────────────────────────────────────────────────────────
-- El `sid` viaja en el access token y en el refresh token: revocar la fila
-- invalida ambos al instante, que es lo que hace real el "cerrar sesión".
CREATE TABLE IF NOT EXISTS tbl_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  str_user_id      UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  str_refresh_hash VARCHAR(64) NOT NULL,
  str_user_agent   TEXT,
  str_ip           VARCHAR(64),
  dat_last_used    TIMESTAMPTZ NOT NULL DEFAULT now(),
  dat_expires_at   TIMESTAMPTZ NOT NULL,
  bol_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON tbl_sessions (str_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON tbl_sessions (dat_expires_at);

-- Cuentas que nunca cambiaron la contraseña: se ancla la política a su creación,
-- de modo que la caducidad sea determinista y no dependa de un NULL.
UPDATE tbl_users
   SET dat_password_changed_at = "createdAt"
 WHERE dat_password_changed_at IS NULL;
