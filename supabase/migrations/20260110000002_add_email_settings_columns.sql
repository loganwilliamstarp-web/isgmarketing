-- Add email configuration columns to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS sending_domain TEXT,
ADD COLUMN IF NOT EXISTS default_from_name TEXT,
ADD COLUMN IF NOT EXISTS default_from_email TEXT,
ADD COLUMN IF NOT EXISTS reply_to_email TEXT;

-- Add comments describing the columns
COMMENT ON COLUMN user_settings.sending_domain IS 'The domain used for sending emails (must be verified in SendGrid)';
COMMENT ON COLUMN user_settings.default_from_name IS 'Default sender name for outgoing emails';
COMMENT ON COLUMN user_settings.default_from_email IS 'Default sender email address for outgoing emails';
COMMENT ON COLUMN user_settings.reply_to_email IS 'Reply-to email address for automated emails';
