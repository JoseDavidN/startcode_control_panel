-- Migration: Add tbl_agent_metrics_history for time-series metrics
-- Replaces the UPSERT model (single row per server) with append-only history.
-- tbl_agent_metrics remains as the current-snapshot table for fast reads.

CREATE TABLE IF NOT EXISTS tbl_agent_metrics_history (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  server_id       UUID          NOT NULL,
  timestamp       TIMESTAMP     NOT NULL DEFAULT now(),

  -- CPU
  cpu_usage             NUMERIC(5,2),
  cpu_load_average_1m   NUMERIC(5,2),

  -- Memory
  memory_usage_percent  NUMERIC(5,2),
  swap_usage_percent    NUMERIC(5,2),

  -- Disk (root filesystem, denormalized)
  disk_usage_percent    NUMERIC(5,2),

  -- Network
  network_connections_active  INTEGER,

  -- System
  system_uptime         NUMERIC(15,2),

  CONSTRAINT pk_agent_metrics_history PRIMARY KEY (id),
  CONSTRAINT fk_agent_metrics_history_server
    FOREIGN KEY (server_id) REFERENCES tbl_servers(id) ON DELETE CASCADE
);

-- Compound index for efficient time-range queries per server
CREATE INDEX IF NOT EXISTS idx_agent_metrics_history_server_ts
  ON tbl_agent_metrics_history (server_id, timestamp DESC);

-- Optional: retention helper — delete rows older than 30 days
-- Run periodically via cron or pg_cron:
-- DELETE FROM tbl_agent_metrics_history WHERE timestamp < now() - INTERVAL '30 days';
