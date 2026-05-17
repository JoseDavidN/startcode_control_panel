-- Migration: Add websites and databases columns to tbl_agent_metrics
-- Date: 2025-11-19

-- Add websites columns
ALTER TABLE tbl_agent_metrics
ADD COLUMN IF NOT EXISTS websites_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS websites_list JSONB;

-- Add databases columns
ALTER TABLE tbl_agent_metrics
ADD COLUMN IF NOT EXISTS databases_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS databases_list JSONB;

-- Update existing rows to have default values
UPDATE tbl_agent_metrics
SET
  websites_count = 0,
  databases_count = 0
WHERE
  websites_count IS NULL
  OR databases_count IS NULL;
