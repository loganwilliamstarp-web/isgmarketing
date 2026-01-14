-- Ensure RLS is disabled on master_automations table
-- This table should only be accessed by admins through the application
ALTER TABLE master_automations DISABLE ROW LEVEL SECURITY;

-- Also ensure master_templates has RLS disabled
ALTER TABLE master_templates DISABLE ROW LEVEL SECURITY;
