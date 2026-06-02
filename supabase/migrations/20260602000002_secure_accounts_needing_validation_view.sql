-- Migration: make accounts_needing_validation enforce RLS (security_invoker)
--
-- The view exposes rows from public.accounts. A Postgres view runs with the
-- privileges of its OWNER unless security_invoker is on -- the default is OFF.
-- So despite an earlier migration "fixing" this (its comment claimed the view
-- "uses SECURITY INVOKER by default", which is incorrect), the view still read
-- accounts while bypassing that table's row-level security. Anyone with SELECT
-- on the view could therefore read every account, not just their own. This is
-- what the security advisor flags as "public / RLS not enforced".
--
-- Fix: recreate WITH (security_invoker = on) so the view evaluates accounts'
-- RLS as the querying role, and lock the grants down to authenticated +
-- service_role (revoke anon / PUBLIC). service_role still bypasses RLS, so the
-- email-validation path is unaffected; the view is not referenced by app code.

DROP VIEW IF EXISTS public.accounts_needing_validation;

CREATE VIEW public.accounts_needing_validation
WITH (security_invoker = on) AS
SELECT
  account_unique_id,
  owner_id,
  name,
  person_email,
  email,
  email_validation_status,
  email_validated_at,
  CASE
    WHEN email_validation_status IS NULL OR email_validation_status = 'unknown' THEN 'never_validated'
    WHEN email_validated_at < NOW() - INTERVAL '90 days' THEN 'expired'
    ELSE 'up_to_date'
  END AS validation_state
FROM public.accounts
WHERE person_email IS NOT NULL
  AND (
    email_validation_status IS NULL
    OR email_validation_status = 'unknown'
    OR email_validated_at < NOW() - INTERVAL '90 days'
  );

-- Lock down access: no anon / PUBLIC, only authenticated (RLS-scoped) + service_role.
REVOKE ALL ON public.accounts_needing_validation FROM anon, PUBLIC;
GRANT SELECT ON public.accounts_needing_validation TO authenticated;
GRANT SELECT ON public.accounts_needing_validation TO service_role;

COMMENT ON VIEW public.accounts_needing_validation IS
  'Accounts needing email validation (unknown status or validated > 90 days ago). '
  'security_invoker=on so it enforces public.accounts RLS as the querying role.';
