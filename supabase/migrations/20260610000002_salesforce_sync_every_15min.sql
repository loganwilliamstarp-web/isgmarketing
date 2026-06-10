-- Migration: run the pull-based Salesforce sync every 15 minutes
--
-- The hourly tick left dashboards up to an hour stale. The sync is
-- incremental (SystemModstamp cursor per object), so each run only pulls
-- the last 15 minutes of changes - typically a handful of records and a
-- few SF API calls (~96 runs/day is far under API limits).
--
-- The push-based sync-salesforce-data report importer is retired at the
-- same time; this pull sync is now the only data path.

-- Remove the old hourly schedule
SELECT cron.unschedule('sync-salesforce-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-salesforce-hourly');

-- Idempotent re-run guard
SELECT cron.unschedule('sync-salesforce-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-salesforce-15min');

SELECT cron.schedule(
  job_name := 'sync-salesforce-15min',
  schedule := '*/15 * * * *',
  command := $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/sync-salesforce',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
