-- Allow admins to update any user's settings (for impersonation feature)
-- Since this app uses Salesforce authentication (not Supabase auth),
-- auth.uid() is null and RLS policies based on it won't work.
-- Authorization is handled at the application layer.

-- Drop existing policies
DROP POLICY IF EXISTS user_settings_policy ON user_settings;
DROP POLICY IF EXISTS user_settings_owner_policy ON user_settings;
DROP POLICY IF EXISTS user_settings_select_policy ON user_settings;
DROP POLICY IF EXISTS user_settings_update_policy ON user_settings;
DROP POLICY IF EXISTS user_settings_insert_policy ON user_settings;

-- Disable RLS on user_settings since auth is handled at application layer
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
