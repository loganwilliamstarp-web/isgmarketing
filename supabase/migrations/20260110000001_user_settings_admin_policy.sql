-- Allow admins to update any user's settings (for impersonation feature)
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS user_settings_policy ON user_settings;

-- Create new policy that allows:
-- 1. Users to manage their own settings
-- 2. Agency admins (marketing_cloud_agency_admin=true) to manage any user's settings
CREATE POLICY user_settings_owner_policy ON user_settings
FOR ALL USING (
  user_id = auth.uid()::text
  OR
  EXISTS (
    SELECT 1 FROM users
    WHERE user_unique_id = auth.uid()::text
    AND marketing_cloud_agency_admin = true
  )
);

-- Add comment explaining the policy
COMMENT ON POLICY user_settings_owner_policy ON user_settings IS
'Allows users to manage their own settings, and agency admins (marketing_cloud_agency_admin=true) to manage any user settings for impersonation feature';
