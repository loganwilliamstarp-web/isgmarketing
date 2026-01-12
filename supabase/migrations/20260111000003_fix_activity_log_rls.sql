-- Migration: Fix activity_log RLS to allow service role and authenticated access
-- The original policy used current_setting which doesn't work with Supabase client

-- Drop the old policy
DROP POLICY IF EXISTS activity_log_policy ON activity_log;

-- Create policies that match the pattern used by other tables

-- Authenticated users can view activity logs (filtering done by application)
CREATE POLICY "Authenticated can view activity_log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "Service role full access activity_log"
  ON activity_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can read (for edge functions)
CREATE POLICY "Anon can view activity_log"
  ON activity_log FOR SELECT
  TO anon
  USING (true);

-- Allow inserts for authenticated users
CREATE POLICY "Authenticated can insert activity_log"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
