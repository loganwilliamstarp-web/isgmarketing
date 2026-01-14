-- Migration: Complete fix for email_logs RLS policies
-- Drops all existing policies and recreates the correct ones

-- Drop ALL existing policies on email_logs
DROP POLICY IF EXISTS "Authenticated can view email_logs" ON email_logs;
DROP POLICY IF EXISTS "Service role full access email_logs" ON email_logs;
DROP POLICY IF EXISTS "Anon can view email_logs" ON email_logs;
DROP POLICY IF EXISTS "Authenticated can insert email_logs" ON email_logs;
DROP POLICY IF EXISTS "Authenticated can update email_logs" ON email_logs;
DROP POLICY IF EXISTS "email_logs_policy" ON email_logs;
DROP POLICY IF EXISTS "email_logs_select_policy" ON email_logs;
DROP POLICY IF EXISTS "email_logs_insert_policy" ON email_logs;
DROP POLICY IF EXISTS "email_logs_update_policy" ON email_logs;

-- Ensure RLS is enabled
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (filtering is done at application level)

-- Authenticated users can view all email logs
CREATE POLICY "Authenticated can view email_logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access email_logs"
  ON email_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can read (for webhook tracking - opens, clicks)
CREATE POLICY "Anon can view email_logs"
  ON email_logs FOR SELECT
  TO anon
  USING (true);

-- Anon can update (for webhook tracking - recording opens, clicks)
CREATE POLICY "Anon can update email_logs"
  ON email_logs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Authenticated users can insert email logs
CREATE POLICY "Authenticated can insert email_logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update email logs
CREATE POLICY "Authenticated can update email_logs"
  ON email_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
