-- Migration: Revert to per-user OAuth connections
-- OAuth connections are now per-user (owner_id) instead of per-agency
-- This allows each user to connect their own email account for inbox injection

-- Drop the agency-level unique constraint
ALTER TABLE email_provider_connections
DROP CONSTRAINT IF EXISTS email_provider_connections_agency_provider_key;

-- Re-add the per-user unique constraint (owner_id + provider)
-- Use DO block to handle case where constraint might already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_provider_connections_owner_id_provider_key'
  ) THEN
    ALTER TABLE email_provider_connections
    ADD CONSTRAINT email_provider_connections_owner_id_provider_key
    UNIQUE (owner_id, provider);
  END IF;
END
$$;

-- The agency_id column can stay for backwards compatibility
-- It's just not used for connection lookups anymore

-- Update comments to reflect new usage
COMMENT ON TABLE email_provider_connections IS 'OAuth connections for Gmail and Microsoft 365 - per-user connections for inbox injection';
COMMENT ON COLUMN email_provider_connections.owner_id IS 'User identifier (Salesforce user ID) - each user has their own connection';
COMMENT ON COLUMN email_provider_connections.agency_id IS 'Deprecated - was used for agency-level connections, kept for backwards compatibility';
