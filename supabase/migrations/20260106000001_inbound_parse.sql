-- Migration: Add inbound parse support for reply tracking
-- This enables capturing email replies and calculating response rates

-- ============================================
-- Add reply tracking columns to email_logs
-- ============================================
ALTER TABLE email_logs
ADD COLUMN IF NOT EXISTS first_replied_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_message_id VARCHAR(255);

-- Index for matching replies via In-Reply-To header
CREATE INDEX IF NOT EXISTS idx_email_logs_custom_message_id ON email_logs(custom_message_id)
WHERE custom_message_id IS NOT NULL;

-- Index for reply tracking queries
CREATE INDEX IF NOT EXISTS idx_email_logs_replied ON email_logs(owner_id, first_replied_at)
WHERE first_replied_at IS NOT NULL;

-- ============================================
-- Add inbound parse config to sender_domains
-- ============================================
ALTER TABLE sender_domains
ADD COLUMN IF NOT EXISTS inbound_parse_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS inbound_subdomain TEXT DEFAULT 'parse';

-- ============================================
-- TABLE: email_replies
-- Stores incoming email replies linked to original sent emails
-- ============================================
CREATE TABLE IF NOT EXISTS email_replies (
  id SERIAL PRIMARY KEY,

  -- Ownership & Relationships
  owner_id TEXT NOT NULL,
  email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(account_unique_id) ON DELETE SET NULL,

  -- Sender info (person replying)
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),

  -- Original recipient (our parse address)
  to_email VARCHAR(255),

  -- Email content
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,

  -- Headers for threading
  in_reply_to VARCHAR(255),
  message_id VARCHAR(255),
  references_header TEXT,

  -- Attachments metadata (not storing actual files)
  attachment_count INTEGER DEFAULT 0,
  attachments_info JSONB DEFAULT '[]',

  -- SPF/DKIM validation from SendGrid
  spf VARCHAR(20),
  dkim VARCHAR(100),
  spam_score DECIMAL(5,2),

  -- Raw data for debugging
  raw_headers JSONB,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for email_replies
CREATE INDEX IF NOT EXISTS idx_email_replies_owner ON email_replies(owner_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_email_log ON email_replies(email_log_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_from ON email_replies(from_email);
CREATE INDEX IF NOT EXISTS idx_email_replies_received ON email_replies(owner_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_replies_account ON email_replies(account_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own replies
CREATE POLICY email_replies_owner_policy ON email_replies
  FOR ALL USING (owner_id = current_setting('app.current_user_id', true));

-- ============================================
-- TRIGGER: Update email_logs when reply received
-- ============================================
CREATE OR REPLACE FUNCTION update_email_log_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if we have a linked email_log
  IF NEW.email_log_id IS NOT NULL THEN
    UPDATE email_logs SET
      first_replied_at = COALESCE(first_replied_at, NEW.received_at),
      reply_count = reply_count + 1,
      updated_at = NOW()
    WHERE id = NEW.email_log_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_reply_received
  AFTER INSERT ON email_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_email_log_on_reply();

-- ============================================
-- FUNCTION: Calculate response rate
-- ============================================
CREATE OR REPLACE FUNCTION get_response_rate(
  p_owner_id TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_automation_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
  total_delivered BIGINT,
  total_replied BIGINT,
  response_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::BIGINT as total_delivered,
    COUNT(*) FILTER (WHERE first_replied_at IS NOT NULL)::BIGINT as total_replied,
    CASE
      WHEN COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE first_replied_at IS NOT NULL)::DECIMAL /
        COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) * 100,
        2
      )
      ELSE 0
    END as response_rate
  FROM email_logs
  WHERE owner_id = p_owner_id
    AND (p_start_date IS NULL OR sent_at >= p_start_date)
    AND (p_end_date IS NULL OR sent_at < p_end_date + INTERVAL '1 day')
    AND (p_automation_id IS NULL OR automation_id = p_automation_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Add response stats to daily aggregation
-- ============================================
ALTER TABLE email_stats_daily
ADD COLUMN IF NOT EXISTS replies INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS response_rate DECIMAL(5,2) DEFAULT 0;
