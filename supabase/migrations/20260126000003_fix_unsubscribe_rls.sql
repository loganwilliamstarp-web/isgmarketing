-- Fix RLS policies for unsubscribes table to allow anonymous users to unsubscribe
-- The unsubscribe page is public and uses the anon key

-- First, ensure RLS is enabled
ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can insert unsubscribes" ON unsubscribes;
DROP POLICY IF EXISTS "Authenticated users can view unsubscribes" ON unsubscribes;
DROP POLICY IF EXISTS "Users can view their own unsubscribes" ON unsubscribes;
DROP POLICY IF EXISTS "Anonymous can insert unsubscribes" ON unsubscribes;
DROP POLICY IF EXISTS "Service role full access unsubscribes" ON unsubscribes;

-- Allow anonymous users to INSERT (for public unsubscribe page)
CREATE POLICY "Anonymous can insert unsubscribes"
  ON unsubscribes FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to SELECT (to check if already unsubscribed)
CREATE POLICY "Anonymous can check unsubscribes"
  ON unsubscribes FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to view unsubscribes (for the admin UI)
CREATE POLICY "Authenticated can view unsubscribes"
  ON unsubscribes FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to manage unsubscribes
CREATE POLICY "Authenticated can insert unsubscribes"
  ON unsubscribes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update unsubscribes"
  ON unsubscribes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete unsubscribes"
  ON unsubscribes FOR DELETE
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "Service role full access unsubscribes"
  ON unsubscribes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also fix email_logs so anonymous can update the status
DROP POLICY IF EXISTS "Anonymous can update email_logs unsubscribe" ON email_logs;

CREATE POLICY "Anonymous can update email_logs unsubscribe"
  ON email_logs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- And allow anonymous to select email_logs (to get owner_id for activity log)
DROP POLICY IF EXISTS "Anonymous can select email_logs for unsubscribe" ON email_logs;

CREATE POLICY "Anonymous can select email_logs for unsubscribe"
  ON email_logs FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous to insert activity_log entries
DROP POLICY IF EXISTS "Anonymous can insert activity_log" ON activity_log;

CREATE POLICY "Anonymous can insert activity_log"
  ON activity_log FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous to update accounts opt-out status
DROP POLICY IF EXISTS "Anonymous can update account opt out" ON accounts;

CREATE POLICY "Anonymous can update account opt out"
  ON accounts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

SELECT 'Unsubscribe RLS policies fixed' as status;
