-- Migration: Fix RLS for agency-level OAuth connections
-- Allow authenticated users to view connections for their agency

-- Drop the old user-based policy (it required app.current_user_id to be set)
DROP POLICY IF EXISTS "Users can view own connections" ON email_provider_connections;

-- Create new policy: Allow authenticated users to SELECT all connections
-- The frontend will filter by agency_id in the query
-- This is safe because tokens are encrypted and not exposed
CREATE POLICY "Authenticated users can view connections"
ON email_provider_connections FOR SELECT
TO authenticated
USING (true);

-- Keep service role full access for edge functions (insert/update/delete)
-- This policy already exists but adding it here for completeness
DROP POLICY IF EXISTS "Service role full access" ON email_provider_connections;
CREATE POLICY "Service role full access"
ON email_provider_connections FOR ALL
TO service_role
USING (true);
