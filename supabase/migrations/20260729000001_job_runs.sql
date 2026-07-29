-- Job-run observability.
--
-- The cron jobs invoke edge functions via net.http_post, which discards the
-- HTTP response - so a failing refresh/sync/validation run was invisible
-- outside the function logs. Each edge function now writes one row per run
-- into job_runs (see supabase/functions/_shared/jobRuns.ts); the master admin
-- dashboard surfaces recent runs and failures.

CREATE TABLE IF NOT EXISTS job_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name TEXT NOT NULL,
  action TEXT,                                  -- e.g. 'daily', 'reconcile' for process-scheduled-emails
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  summary JSONB NOT NULL DEFAULT '{}',          -- per-job counters (sent, failed, records synced, ...)
  error_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT[] NOT NULL DEFAULT '{}',          -- capped at 50 entries by the writer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at DESC);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

-- Reads: ops metadata only (counters + error strings, no recipient PII).
-- The dashboard reads it client-side like the rest of the app. Writes happen
-- exclusively through the service role (edge functions), which bypasses RLS -
-- there is intentionally NO insert/update/delete policy.
DROP POLICY IF EXISTS "job_runs_select" ON job_runs;
CREATE POLICY "job_runs_select" ON job_runs FOR SELECT USING (true);

-- Retention: keep 30 days of history.
SELECT cron.schedule(
  'cleanup-job-runs',
  '30 6 * * *',
  $$DELETE FROM job_runs WHERE started_at < NOW() - INTERVAL '30 days'$$
);
