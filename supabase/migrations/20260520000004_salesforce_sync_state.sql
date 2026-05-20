-- Migration: state table for the pull-based Salesforce sync (sync-salesforce)
--
-- One row per synced table. last_synced_at is the incremental cursor - the
-- high-water mark of the Salesforce SystemModstamp processed so far. It also
-- doubles as the observability surface for the sync (last run, status, error,
-- cumulative record count).

CREATE TABLE IF NOT EXISTS salesforce_sync_state (
  table_name     TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  last_run_at    TIMESTAMPTZ,
  last_status    TEXT,
  last_error     TEXT,
  records_synced BIGINT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed one row per table. The cursor starts at the epoch so the first runs
-- backfill the full Salesforce history, then settle into hourly deltas.
INSERT INTO salesforce_sync_state (table_name) VALUES
  ('accounts'), ('policies'), ('carriers'), ('producers')
ON CONFLICT (table_name) DO NOTHING;
