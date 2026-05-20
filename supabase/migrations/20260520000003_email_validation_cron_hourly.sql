-- Migration: Run email validation hourly instead of once daily
--
-- The validate-emails function now validates accounts concurrently, so it can
-- clear much larger backlogs per run. Running hourly keeps contacts validated
-- well ahead of the 24h pre-send check, so brand-new users don't wait a day
-- for their contacts to become eligible.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove the previous schedule(s) if present (idempotent)
SELECT cron.unschedule('validate-emails-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'validate-emails-daily');

SELECT cron.unschedule('validate-emails-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'validate-emails-hourly');

-- Hourly email validation
SELECT cron.schedule(
  job_name := 'validate-emails-hourly',
  schedule := '0 * * * *',  -- top of every hour
  command := $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/validate-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"maxValidations": 5000}'::jsonb
  ) AS request_id;
  $$
);
