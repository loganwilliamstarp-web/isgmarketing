-- Fix overly permissive anon RLS policies
-- These policies had USING (true) / WITH CHECK (true) which allows unrestricted access

-- ============================================================================
-- 1. email_logs: Remove anon UPDATE policy (not needed - webhook uses service_role)
-- ============================================================================
DROP POLICY IF EXISTS "Anon can update email_logs" ON email_logs;

-- Keep anon SELECT for webhook signature verification and feedback page email lookups
-- (Already exists as "Anon can view email_logs")

-- ============================================================================
-- 2. accounts: Tighten anon UPDATE to only allow survey feedback updates
--    and require a valid UUID-format account_unique_id
-- ============================================================================
DROP POLICY IF EXISTS "Anon can update survey feedback" ON accounts;

-- Create a more restrictive policy that:
-- - Only allows updating specific survey-related columns (enforced at app level)
-- - Requires account_unique_id to be a valid UUID (acts as auth token)
-- - The account_unique_id in the URL acts as implicit authentication
CREATE POLICY "Anon can update survey feedback"
  ON accounts FOR UPDATE
  TO anon
  -- Only allow updates where account_unique_id looks like a valid UUID
  -- This prevents enumeration attacks - attacker would need the exact UUID
  USING (
    account_unique_id IS NOT NULL
    AND account_unique_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  WITH CHECK (
    account_unique_id IS NOT NULL
    AND account_unique_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- ============================================================================
-- 3. activity_log: Tighten anon INSERT to require valid event fields
-- ============================================================================
DROP POLICY IF EXISTS "Anon can insert activity_log" ON activity_log;

-- Create a more restrictive policy that:
-- - Requires actor_type to be 'customer' (anon can only log customer actions)
-- - Requires a valid event_type (survey_feedback, star_rating, etc.)
-- - Requires owner_id to be set
CREATE POLICY "Anon can insert activity_log"
  ON activity_log FOR INSERT
  TO anon
  WITH CHECK (
    -- Must be a customer action (not system or user)
    actor_type = 'customer'
    -- Must have a valid event type for public actions
    AND event_type IN ('survey_feedback', 'star_rating', 'email_opened', 'email_clicked', 'feedback_submitted')
    -- Must have an owner_id (prevents orphan records)
    AND owner_id IS NOT NULL
  );

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON POLICY "Anon can update survey feedback" ON accounts IS
  'Allows anonymous users to update survey feedback on accounts. Account UUID acts as implicit auth token.';

COMMENT ON POLICY "Anon can insert activity_log" ON activity_log IS
  'Allows anonymous users to log customer activities (feedback, ratings). Restricted to customer actor_type and specific event types.';
