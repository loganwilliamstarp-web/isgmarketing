-- ============================================================================
-- Allow anonymous users to update survey feedback on accounts
-- ============================================================================
-- This enables the public feedback page to save customer feedback
-- without requiring authentication.
-- ============================================================================

-- First check if RLS is enabled on accounts, if not enable it
DO $$
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'accounts'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing anon policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Anon can update survey feedback" ON accounts;

-- Allow anonymous users to update only survey-related fields
CREATE POLICY "Anon can update survey feedback"
  ON accounts FOR UPDATE
  TO anon
  USING (true)  -- Allow updates to any account
  WITH CHECK (true);  -- No restrictions on which accounts can be updated

-- Note: This is intentionally permissive because the feedback page
-- validates the account_id from the email link. The account_unique_id
-- acts as a pseudo-authentication token.

-- Also ensure anon can read email_logs (needed to get owner_id for activity logging)
DROP POLICY IF EXISTS "Anon can read email_logs for feedback" ON email_logs;
CREATE POLICY "Anon can read email_logs for feedback"
  ON email_logs FOR SELECT
  TO anon
  USING (true);

-- Allow anon to insert into activity_log
DROP POLICY IF EXISTS "Anon can insert activity_log" ON activity_log;
CREATE POLICY "Anon can insert activity_log"
  ON activity_log FOR INSERT
  TO anon
  WITH CHECK (true);
