-- Fix security advisor warnings for RLS and SECURITY DEFINER view

-- 1. Enable RLS on master_automations table
ALTER TABLE public.master_automations ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on master_templates table
ALTER TABLE public.master_templates ENABLE ROW LEVEL SECURITY;

-- 3. Fix the accounts_needing_validation view - recreate without SECURITY DEFINER
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
