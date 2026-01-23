-- Fix security advisor warning for SECURITY DEFINER view
-- Note: master_automations and master_templates intentionally have RLS disabled
-- (see migration 20260113000004) - these are admin-only tables accessed via service role

-- Fix the accounts_needing_validation view - recreate without SECURITY DEFINER
-- First drop the existing view
DROP VIEW IF EXISTS public.accounts_needing_validation;

-- Recreate without SECURITY DEFINER (uses SECURITY INVOKER by default)
CREATE VIEW public.accounts_needing_validation AS
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

-- Grant appropriate permissions on the view
GRANT SELECT ON public.accounts_needing_validation TO authenticated;
GRANT SELECT ON public.accounts_needing_validation TO service_role;
