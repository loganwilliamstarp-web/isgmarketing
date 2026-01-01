-- Sender Domains table for agency domain authentication with SendGrid
-- Each agency can add their own sending domains and verify them via DNS

-- ============================================================================
-- SENDER_DOMAINS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sender_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,

  -- Domain info
  domain TEXT NOT NULL,
  subdomain TEXT DEFAULT 'em',  -- SendGrid uses subdomains like em.domain.com

  -- SendGrid authentication IDs (returned when creating domain auth)
  sendgrid_domain_id INTEGER,

  -- Verification status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, verified, failed
  verified_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,

  -- DNS records that need to be added (stored from SendGrid response)
  dns_records JSONB,
  -- Example structure:
  -- {
  --   "mail_cname": { "host": "em1234.domain.com", "data": "u1234.wl.sendgrid.net", "valid": false },
  --   "dkim1": { "host": "s1._domainkey.domain.com", "data": "s1.domainkey.u1234.wl.sendgrid.net", "valid": false },
  --   "dkim2": { "host": "s2._domainkey.domain.com", "data": "s2.domainkey.u1234.wl.sendgrid.net", "valid": false }
  -- }

  -- Default sender info for this domain
  default_from_email TEXT,  -- e.g., noreply@domain.com
  default_from_name TEXT,   -- e.g., "Smith Insurance Agency"

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(owner_id, domain)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sender_domains_owner ON sender_domains (owner_id);
CREATE INDEX IF NOT EXISTS idx_sender_domains_status ON sender_domains (status);
CREATE INDEX IF NOT EXISTS idx_sender_domains_domain ON sender_domains (domain);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE sender_domains ENABLE ROW LEVEL SECURITY;

-- Users can only see their own domains
CREATE POLICY "Users can view own sender domains"
ON sender_domains FOR SELECT
USING (owner_id = auth.uid()::text);

-- Users can add their own domains
CREATE POLICY "Users can insert own sender domains"
ON sender_domains FOR INSERT
WITH CHECK (owner_id = auth.uid()::text);

-- Users can update their own domains
CREATE POLICY "Users can update own sender domains"
ON sender_domains FOR UPDATE
USING (owner_id = auth.uid()::text);

-- Users can delete their own domains
CREATE POLICY "Users can delete own sender domains"
ON sender_domains FOR DELETE
USING (owner_id = auth.uid()::text);

-- Service role full access
CREATE POLICY "Service role full access sender domains"
ON sender_domains FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sender_domains IS 'Stores agency sender domains for SendGrid authentication';
COMMENT ON COLUMN sender_domains.sendgrid_domain_id IS 'SendGrid domain authentication ID returned from API';
COMMENT ON COLUMN sender_domains.dns_records IS 'DNS CNAME records that agency needs to add for verification';
COMMENT ON COLUMN sender_domains.subdomain IS 'Subdomain prefix for mail sending (default: em)';

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'sender_domains table created successfully' as status;
