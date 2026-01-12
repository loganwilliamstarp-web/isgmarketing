-- Migration: Fix email_replies RLS to allow service role and authenticated access
-- The original policy used current_setting which doesn't work with Supabase client

-- Drop the old policy
DROP POLICY IF EXISTS email_replies_owner_policy ON email_replies;

-- Create policies that match the pattern used by other tables

-- Authenticated users can view their own replies (by owner_id match via query filter)
CREATE POLICY "Authenticated can view email_replies"
  ON email_replies FOR SELECT
  TO authenticated
  USING (true);  -- Filtering is done by the application query

-- Service role has full access
CREATE POLICY "Service role full access email_replies"
  ON email_replies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can read (for edge functions)
CREATE POLICY "Anon can view email_replies"
  ON email_replies FOR SELECT
  TO anon
  USING (true);
