-- Add signature_html column to user_settings table for rich text signatures
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS signature_html TEXT;

-- Add a comment to describe the column
COMMENT ON COLUMN user_settings.signature_html IS 'HTML content for the user email signature created via the rich text editor';
