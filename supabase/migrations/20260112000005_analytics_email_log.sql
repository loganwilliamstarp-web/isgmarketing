-- Migration: Create analytics_email_log table for tracking daily analytics emails sent to admins
-- This table logs when analytics emails are sent to master admins

-- Create the analytics email log table
CREATE TABLE IF NOT EXISTS analytics_email_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_analytics_email_log_sent_at ON analytics_email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_email_log_recipient ON analytics_email_log(recipient_email);
CREATE INDEX IF NOT EXISTS idx_analytics_email_log_status ON analytics_email_log(status);

-- Add comment for documentation
COMMENT ON TABLE analytics_email_log IS 'Tracks daily analytics emails sent to master administrators';
COMMENT ON COLUMN analytics_email_log.recipient_email IS 'Email address of the recipient (master admin)';
COMMENT ON COLUMN analytics_email_log.recipient_name IS 'Name of the recipient';
COMMENT ON COLUMN analytics_email_log.subject IS 'Subject line of the analytics email';
COMMENT ON COLUMN analytics_email_log.sent_at IS 'Timestamp when the email was sent';
COMMENT ON COLUMN analytics_email_log.status IS 'Status of the email: sent, failed, or pending';
COMMENT ON COLUMN analytics_email_log.error_message IS 'Error message if the email failed to send';

-- Disable RLS for this table since it's only written by edge functions (service role)
ALTER TABLE analytics_email_log ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (edge functions)
CREATE POLICY "Service role has full access to analytics_email_log"
    ON analytics_email_log
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON analytics_email_log TO authenticated;
GRANT ALL ON analytics_email_log TO service_role;
