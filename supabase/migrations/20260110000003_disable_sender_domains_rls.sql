-- Disable RLS on sender_domains since app uses Salesforce auth (not Supabase auth)
-- auth.uid() is null for Salesforce users, so RLS policies don't work
-- Authorization is handled at the application layer

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can insert own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can update own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can delete own sender domains" ON sender_domains;

-- Disable RLS
ALTER TABLE sender_domains DISABLE ROW LEVEL SECURITY;
