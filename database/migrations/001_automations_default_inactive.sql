-- ============================================
-- MIGRATION: Automations Default to Inactive (Draft)
-- ============================================
-- Purpose: Ensure all new automations start as 'Draft' (inactive)
--          and optionally update existing 'Active' automations to 'Draft'
-- ============================================

-- 1. Update the default value for status column (if different)
ALTER TABLE automations 
ALTER COLUMN status SET DEFAULT 'Draft';

-- 2. Update ALL existing automations from 'Active' to 'Draft'
-- Run this if you want to deactivate all currently active automations
UPDATE automations 
SET status = 'Draft', 
    updated_at = NOW()
WHERE status = 'Active';

-- OPTIONAL: If you only want to update automations created by users (not system defaults)
-- UPDATE automations 
-- SET status = 'Draft', 
--     updated_at = NOW()
-- WHERE status = 'Active' 
--   AND is_default = FALSE;

-- 3. Log the migration
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM automations 
  WHERE status = 'Draft';
  
  RAISE NOTICE 'Migration complete. % automations now in Draft status.', updated_count;
END $$;

-- ============================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================

-- Check current status distribution
-- SELECT status, COUNT(*) as count 
-- FROM automations 
-- GROUP BY status;

-- Verify default is set correctly
-- SELECT column_name, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'automations' 
--   AND column_name = 'status';
