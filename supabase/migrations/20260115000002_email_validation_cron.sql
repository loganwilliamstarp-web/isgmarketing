-- Migration: Set up cron job for daily email validation
-- Runs once per day to validate emails that are unknown or > 90 days old

-- Ensure pg_cron extension is enabled (should already be from analytics migration)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily Email Validation - runs at 2am CT (8:00 UTC)
-- Run early morning to avoid peak hours, before the main email sending cron
SELECT cron.schedule(
  'validate-emails-daily',
  '0 8 * * *',  -- 8:00 UTC = 2am CT
  $$
  SELECT net.http_post(
    url := 'https://wpgncfbjghmyvrpadeuw.supabase.co/functions/v1/validate-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"maxValidations": 500}'::jsonb
  ) AS request_id;
  $$
);

-- Add comment for documentation
COMMENT ON FUNCTION cron.schedule IS 'Schedule periodic tasks including email validation';
