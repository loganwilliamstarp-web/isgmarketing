-- Migration: Update email_provider_connections for agency-level OAuth
-- OAuth connections are now per-agency (profile_name) instead of per-user

-- Add agency_id column for agency-level connections
ALTER TABLE email_provider_connections
ADD COLUMN IF NOT EXISTS agency_id TEXT;

-- Migrate existing connections: copy owner_id to agency_id temporarily
-- (In practice, the admin should reconnect after this migration)
UPDATE email_provider_connections
SET agency_id = owner_id
WHERE agency_id IS NULL;

-- Create index for agency lookups
CREATE INDEX IF NOT EXISTS idx_email_provider_connections_agency
ON email_provider_connections(agency_id);

-- Drop the old unique constraint if it exists
ALTER TABLE email_provider_connections
DROP CONSTRAINT IF EXISTS email_provider_connections_owner_id_provider_key;

-- Add new unique constraint for agency + provider
-- Use DO block to handle case where constraint might already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_provider_connections_agency_provider_key'
  ) THEN
    ALTER TABLE email_provider_connections
    ADD CONSTRAINT email_provider_connections_agency_provider_key
    UNIQUE (agency_id, provider);
  END IF;
END
$$;

-- Comments
COMMENT ON COLUMN email_provider_connections.agency_id IS 'Agency identifier (profile_name) - connections are shared across agency users';
