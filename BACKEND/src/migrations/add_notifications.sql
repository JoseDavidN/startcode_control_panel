-- Historial de notificaciones por usuario.
-- Idempotente: se puede aplicar varias veces sin efectos.
-- En desarrollo la crea TypeORM (synchronize); este script es para producción.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tbl_notifications_enu_type_enum') THEN
    CREATE TYPE tbl_notifications_enu_type_enum AS ENUM (
      'server_offline', 'server_online', 'cpu_high', 'memory_high',
      'disk_high', 'security', 'system'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tbl_notifications_enu_severity_enum') THEN
    CREATE TYPE tbl_notifications_enu_severity_enum AS ENUM ('info', 'warning', 'error');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tbl_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  str_user_id   UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  str_server_id UUID REFERENCES tbl_servers(id) ON DELETE CASCADE,
  enu_type      tbl_notifications_enu_type_enum NOT NULL,
  enu_severity  tbl_notifications_enu_severity_enum NOT NULL DEFAULT 'info',
  str_title     VARCHAR NOT NULL,
  str_body      TEXT NOT NULL,
  json_metadata JSONB,
  bol_read      BOOLEAN NOT NULL DEFAULT FALSE,
  dat_read_at   TIMESTAMP,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON tbl_notifications (str_user_id, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON tbl_notifications (str_user_id, bol_read);
