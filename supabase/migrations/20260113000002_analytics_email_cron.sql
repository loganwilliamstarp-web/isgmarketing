-- Migration: Set up cron jobs for analytics emails
-- Requires pg_cron extension to be enabled

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Daily Admin Analytics - runs at midnight CT (6:00 UTC)
SELECT cron.schedule(
  'send-daily-analytics',
  '0 6 * * *',  -- 6:00 UTC = midnight CT
  $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/send-daily-analytics',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- User Analytics - runs at 7am CT (13:00 UTC)
SELECT cron.schedule(
  'send-user-analytics',
  '0 13 * * *',  -- 13:00 UTC = 7am CT
  $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/send-user-analytics',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Agency Admin Analytics - runs at 7am CT (13:00 UTC)
SELECT cron.schedule(
  'send-agency-analytics',
  '0 13 * * *',  -- 13:00 UTC = 7am CT
  $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/send-agency-analytics',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Add comments for documentation
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used for scheduled analytics emails';
