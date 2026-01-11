-- Re-enable RLS on sender_domains with policies that work with Salesforce auth
-- Since auth.uid() is null for Salesforce users, we use permissive policies for SELECT
-- and rely on edge functions (service role) for write operations

-- First, re-enable RLS
ALTER TABLE sender_domains ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can insert own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can update own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can delete own sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Users can view verified domains matching email" ON sender_domains;
DROP POLICY IF EXISTS "Anyone can view verified domains" ON sender_domains;
DROP POLICY IF EXISTS "Service role full access sender domains" ON sender_domains;
DROP POLICY IF EXISTS "Anon can read verified domains" ON sender_domains;

-- Policy 1: Allow reading verified domains (for all users including Salesforce auth)
-- The anon key can read verified domains - filtering by email domain is done in app
CREATE POLICY "Anon can read verified domains"
ON sender_domains FOR SELECT
TO anon
USING (status = 'verified');

-- Policy 2: Service role has full access (for edge functions that handle writes)
-- All write operations go through edge functions which use service role
CREATE POLICY "Service role full access sender domains"
ON sender_domains FOR ALL
TO service_role
USING (true);
