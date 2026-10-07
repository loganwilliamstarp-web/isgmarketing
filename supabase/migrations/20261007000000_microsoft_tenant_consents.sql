-- Migration: Microsoft 365 tenant-wide (admin consent) connections
--
-- A Microsoft 365 admin approves the app once for their whole organization
-- (Settings -> Integrations -> "Approve for whole agency"). The email-oauth
-- callback verifies the app-only token can reach the admin's mailbox and
-- records the mail domain -> tenant mapping here. sendgrid-inbound-parse then
-- injects replies for every owner on that domain without per-user OAuth.

CREATE TABLE IF NOT EXISTS microsoft_tenant_consents (
  domain TEXT PRIMARY KEY,               -- lower-case mail domain, e.g. isgdfw.com
  tenant_id TEXT NOT NULL,               -- Entra tenant GUID returned by admin consent
  profile_name TEXT,                     -- agency of the user who started the approval
  consented_by TEXT,                     -- users.user_unique_id
  consented_by_email TEXT,
  status TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'error'
    CHECK (status IN ('active', 'error')),
  last_error TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE microsoft_tenant_consents ENABLE ROW LEVEL SECURITY;

-- The settings page reads status; nothing here is secret (no tokens stored).
DROP POLICY IF EXISTS "App can view microsoft tenant consents" ON microsoft_tenant_consents;
CREATE POLICY "App can view microsoft tenant consents"
  ON microsoft_tenant_consents FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes only from edge functions.
DROP POLICY IF EXISTS "Service role can manage microsoft tenant consents" ON microsoft_tenant_consents;
CREATE POLICY "Service role can manage microsoft tenant consents"
  ON microsoft_tenant_consents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
