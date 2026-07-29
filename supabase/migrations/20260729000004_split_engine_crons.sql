-- Split the email engine's cron into a light frequent run and a heavy hourly run.
--
-- The every-5-minute 'daily' action (refresh + verify + send) was exhausting
-- the edge runtime's CPU budget: job_runs shows runs starting but never
-- finishing, killed late in the cycle. The refresh phase - re-filtering every
-- automation's full audience - is the CPU hog, and running it every 5 minutes
-- was never necessary (emails are scheduled days in advance).
--
-- After this migration:
--   */5  cron -> {"action":"process"}  (verify + send only - light)
--   hourly cron -> {"action":"refresh"} (audience refresh on its own budget)
-- Reconciliation keeps its own daily cron.

-- Repoint the existing every-5-minute invoker at the light action.
CREATE OR REPLACE FUNCTION public.invoke_process_scheduled_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'Missing vault secrets: supabase_url or service_role_key. Cron job skipped.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-scheduled-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{"action": "process"}'::jsonb
  );
END;
$$;

-- Dedicated hourly audience refresh.
CREATE OR REPLACE FUNCTION public.invoke_refresh_scheduled_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'Missing vault secrets: supabase_url or service_role_key. Refresh cron skipped.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-scheduled-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{"action": "refresh"}'::jsonb
  );
END;
$$;

-- :10 offset avoids colliding with validate-emails (:00) and sync-salesforce (:00/:15/:30/:45).
SELECT cron.schedule('refresh-scheduled-emails-hourly', '10 * * * *', 'SELECT invoke_refresh_scheduled_emails();');
