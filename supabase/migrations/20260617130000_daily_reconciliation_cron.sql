-- Daily reconciliation sweep for the scheduled-email queue.
--
-- The edge function gained a 'reconcile' action that re-evaluates every Pending
-- automation email against current data and cancels rows whose account no longer
-- matches the automation's filter_config / is past its enrollment limits / whose
-- automation is paused. Correctness is already guaranteed at the verify+send
-- gates; this is queue hygiene, so it runs once a day rather than on the
-- every-5-minute loop.
--
-- This also retires the dead 'email-daily' cron job, which posted
-- {"action":"all"} - an action the function never recognized, so it was a no-op.

-- Trigger the edge function with {"action":"reconcile"}, pulling the URL + service
-- key from Vault (same pattern as invoke_process_scheduled_emails()).
CREATE OR REPLACE FUNCTION public.invoke_reconcile_scheduled_emails()
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
    RAISE WARNING 'Missing vault secrets: supabase_url or service_role_key. Reconcile cron skipped.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-scheduled-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{"action": "reconcile"}'::jsonb
  );
END;
$$;

-- Retire the dead 'email-daily' job (posted action:"all", a no-op).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-daily') THEN
    PERFORM cron.unschedule('email-daily');
  END IF;
END $$;

-- Run reconciliation once daily at 06:00 UTC (cron.schedule upserts by name).
SELECT cron.schedule('reconcile-daily', '0 6 * * *', 'SELECT invoke_reconcile_scheduled_emails();');
