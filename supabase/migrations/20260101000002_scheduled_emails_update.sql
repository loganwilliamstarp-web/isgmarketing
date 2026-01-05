-- Update existing scheduled_emails table with new columns
-- Run this if you already have the scheduled_emails table

-- ============================================================================
-- ADD NEW COLUMNS TO SCHEDULED_EMAILS (if they don't exist)
-- ============================================================================

DO $$
BEGIN
    -- Add qualification_value column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'qualification_value') THEN
        ALTER TABLE scheduled_emails ADD COLUMN qualification_value TEXT;
    END IF;

    -- Add trigger_field column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'trigger_field') THEN
        ALTER TABLE scheduled_emails ADD COLUMN trigger_field TEXT;
    END IF;

    -- Add requires_verification column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'requires_verification') THEN
        ALTER TABLE scheduled_emails ADD COLUMN requires_verification BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add node_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'node_id') THEN
        ALTER TABLE scheduled_emails ADD COLUMN node_id TEXT;
    END IF;

    -- Add from_email column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'from_email') THEN
        ALTER TABLE scheduled_emails ADD COLUMN from_email TEXT;
    END IF;

    -- Add from_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'from_name') THEN
        ALTER TABLE scheduled_emails ADD COLUMN from_name TEXT;
    END IF;

    -- Add subject column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'subject') THEN
        ALTER TABLE scheduled_emails ADD COLUMN subject TEXT;
    END IF;

    -- Add attempts column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'attempts') THEN
        ALTER TABLE scheduled_emails ADD COLUMN attempts INTEGER DEFAULT 0;
    END IF;

    -- Add max_attempts column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'max_attempts') THEN
        ALTER TABLE scheduled_emails ADD COLUMN max_attempts INTEGER DEFAULT 3;
    END IF;

    -- Add last_attempt_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'last_attempt_at') THEN
        ALTER TABLE scheduled_emails ADD COLUMN last_attempt_at TIMESTAMPTZ;
    END IF;

    -- Add email_log_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'email_log_id') THEN
        ALTER TABLE scheduled_emails ADD COLUMN email_log_id UUID;
    END IF;

    -- Add error_message column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'error_message') THEN
        ALTER TABLE scheduled_emails ADD COLUMN error_message TEXT;
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_emails' AND column_name = 'updated_at') THEN
        ALTER TABLE scheduled_emails ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- INDEXES (safe to run multiple times with IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_ready
ON scheduled_emails (status, scheduled_for, requires_verification)
WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_automation_pending
ON scheduled_emails (automation_id, status)
WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_verification
ON scheduled_emails (status, requires_verification, scheduled_for)
WHERE status = 'Pending' AND requires_verification = TRUE;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_dedup
ON scheduled_emails (automation_id, account_id, template_id, qualification_value);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_owner
ON scheduled_emails (owner_id, status);

-- ============================================================================
-- EMAIL_LOGS TRACKING COLUMNS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'sendgrid_message_id') THEN
        ALTER TABLE email_logs ADD COLUMN sendgrid_message_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'first_opened_at') THEN
        ALTER TABLE email_logs ADD COLUMN first_opened_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'first_clicked_at') THEN
        ALTER TABLE email_logs ADD COLUMN first_clicked_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'open_count') THEN
        ALTER TABLE email_logs ADD COLUMN open_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'click_count') THEN
        ALTER TABLE email_logs ADD COLUMN click_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'bounced_at') THEN
        ALTER TABLE email_logs ADD COLUMN bounced_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'bounce_type') THEN
        ALTER TABLE email_logs ADD COLUMN bounce_type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'unsubscribed_at') THEN
        ALTER TABLE email_logs ADD COLUMN unsubscribed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'delivered_at') THEN
        ALTER TABLE email_logs ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_logs_sendgrid_id
ON email_logs (sendgrid_message_id)
WHERE sendgrid_message_id IS NOT NULL;

-- ============================================================================
-- EMAIL_EVENTS TABLE (for click tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_log_id UUID REFERENCES email_logs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_log ON email_events (email_log_id);

-- ============================================================================
-- EMAIL_SUPPRESSIONS TABLE (for bounces/spam reports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on lowercase email (handles case if index doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_email_suppressions_email') THEN
        CREATE UNIQUE INDEX idx_email_suppressions_email ON email_suppressions (LOWER(email));
    END IF;
END $$;

-- ============================================================================
-- RLS POLICIES (safe to run - will skip if exists)
-- ============================================================================

ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Drop and recreate policies to ensure they're correct
    DROP POLICY IF EXISTS "Users can view own scheduled emails" ON scheduled_emails;
    DROP POLICY IF EXISTS "Users can insert own scheduled emails" ON scheduled_emails;
    DROP POLICY IF EXISTS "Users can update own scheduled emails" ON scheduled_emails;
    DROP POLICY IF EXISTS "Users can delete own scheduled emails" ON scheduled_emails;
    DROP POLICY IF EXISTS "Service role full access" ON scheduled_emails;

    CREATE POLICY "Users can view own scheduled emails" ON scheduled_emails FOR SELECT USING (owner_id = auth.uid()::text);
    CREATE POLICY "Users can insert own scheduled emails" ON scheduled_emails FOR INSERT WITH CHECK (owner_id = auth.uid()::text);
    CREATE POLICY "Users can update own scheduled emails" ON scheduled_emails FOR UPDATE USING (owner_id = auth.uid()::text);
    CREATE POLICY "Users can delete own scheduled emails" ON scheduled_emails FOR DELETE USING (owner_id = auth.uid()::text);
    CREATE POLICY "Service role full access" ON scheduled_emails FOR ALL USING (auth.role() = 'service_role');
END $$;

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Migration completed successfully' as status;
