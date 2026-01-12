-- Migration: Fix email_logs RLS to allow service role and authenticated access
-- The original policy used current_setting which doesn't work with Supabase client

-- Drop the old policy
DROP POLICY IF EXISTS email_logs_policy ON email_logs;

-- Create policies that match the pattern used by other tables

-- Authenticated users can view email logs (filtering done by application)
CREATE POLICY "Authenticated can view email_logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "Service role full access email_logs"
  ON email_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can read (for edge functions)
CREATE POLICY "Anon can view email_logs"
  ON email_logs FOR SELECT
  TO anon
  USING (true);

-- Allow inserts for authenticated users
CREATE POLICY "Authenticated can insert email_logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow updates for authenticated users
CREATE POLICY "Authenticated can update email_logs"
  ON email_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
