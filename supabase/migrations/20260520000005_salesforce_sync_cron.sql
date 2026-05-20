-- Migration: hourly cron for the pull-based Salesforce sync
--
-- Invokes the sync-salesforce edge function every hour. The function syncs
-- each object incrementally from its SystemModstamp cursor and self-invokes
-- to drain the initial backfill, so this hourly tick only needs to cover
-- ongoing deltas.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule (idempotent)
SELECT cron.unschedule('sync-salesforce-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-salesforce-hourly');

-- Runs at :30 past the hour, staggered from validate-emails-hourly (:00)
SELECT cron.schedule(
  job_name := 'sync-salesforce-hourly',
  schedule := '30 * * * *',
  command := $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/sync-salesforce',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
