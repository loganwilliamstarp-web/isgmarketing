-- Fix master_automations trigger: change from AFTER UPDATE to BEFORE UPDATE
-- The version increment (NEW.version := OLD.version + 1) only works in BEFORE triggers
-- The sync is handled by the application code after the update completes

-- Drop the existing trigger
DROP TRIGGER IF EXISTS master_automation_sync_trigger ON master_automations;

-- Drop the old function
DROP FUNCTION IF EXISTS on_master_automation_updated();

-- Create new BEFORE UPDATE function that only increments version
-- (Sync is handled by admin.js after the update completes)
CREATE OR REPLACE FUNCTION on_master_automation_updated()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment version on every update
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger as BEFORE UPDATE (not AFTER)
CREATE TRIGGER master_automation_version_trigger
  BEFORE UPDATE ON master_automations
  FOR EACH ROW
  EXECUTE FUNCTION on_master_automation_updated();

-- Note: The sync_master_automation_to_users function is called explicitly
-- from admin.js after the update completes. This ensures the sync reads
-- the newly-updated master data.
