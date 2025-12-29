-- Migration: Add policy_number column to policies table
-- This maps to Policy_Number__c from Salesforce
-- NOTE: policy_number is NOT unique - multiple policies can share the same policy number
-- Only policy_unique_id (Salesforce Id) is used for matching/upsert

-- Add the column if it doesn't exist
ALTER TABLE policies ADD COLUMN IF NOT EXISTS policy_number TEXT;

-- Create non-unique index for faster lookups (not a unique constraint)
CREATE INDEX IF NOT EXISTS idx_policies_policy_number ON policies(policy_number);

-- Comment for documentation
COMMENT ON COLUMN policies.policy_number IS 'Policy number from Salesforce (Policy_Number__c) - NOT unique, multiple policies can share same number';
