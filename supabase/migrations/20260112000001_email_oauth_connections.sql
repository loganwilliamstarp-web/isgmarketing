-- Migration: Email OAuth Connections for Gmail/Microsoft inbox injection
-- This enables reply tracking and inbox injection for users who connect their email

-- Create OAuth connections table
CREATE TABLE IF NOT EXISTS email_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (Salesforce user ID)
  owner_id TEXT NOT NULL,

  -- Provider info
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'microsoft')),

  -- OAuth tokens (encrypted)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Provider-specific identifiers
  provider_email TEXT NOT NULL,
  provider_user_id TEXT,

  -- Scopes granted
  scopes TEXT[],

  -- Connection status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_error TEXT,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one connection per provider per user
  UNIQUE(owner_id, provider)
);

-- Indexes for common queries
CREATE INDEX idx_email_provider_connections_owner ON email_provider_connections(owner_id);
CREATE INDEX idx_email_provider_connections_status ON email_provider_connections(status);
CREATE INDEX idx_email_provider_connections_provider_status ON email_provider_connections(provider, status);

-- RLS policies
ALTER TABLE email_provider_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view own connections"
ON email_provider_connections FOR SELECT
USING (owner_id = current_setting('app.current_user_id', true));

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access"
ON email_provider_connections FOR ALL
USING (auth.role() = 'service_role');

-- Add injection tracking columns to email_replies
ALTER TABLE email_replies
ADD COLUMN IF NOT EXISTS inbox_injected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS inbox_injected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS inbox_injection_provider TEXT,
ADD COLUMN IF NOT EXISTS inbox_injection_error TEXT;

-- Comments for documentation
COMMENT ON TABLE email_provider_connections IS 'OAuth connections for Gmail and Microsoft 365 for inbox injection feature';
COMMENT ON COLUMN email_provider_connections.access_token_encrypted IS 'AES-256-GCM encrypted OAuth access token';
COMMENT ON COLUMN email_provider_connections.refresh_token_encrypted IS 'AES-256-GCM encrypted OAuth refresh token';
COMMENT ON COLUMN email_provider_connections.provider_email IS 'The email address of the connected account';
COMMENT ON COLUMN email_provider_connections.status IS 'active=working, expired=needs refresh, revoked=user revoked, error=API error';
COMMENT ON COLUMN email_replies.inbox_injected IS 'Whether reply was injected into sender inbox via OAuth';
COMMENT ON COLUMN email_replies.inbox_injection_provider IS 'gmail or microsoft - which provider was used for injection';
