-- Migration: Map PT1 to ISG Retail for OAuth connections
-- PT1 is a legacy identifier that should be treated as ISG Retail

-- Update existing connections with agency_id = 'PT1' to use 'ISG Retail'
UPDATE email_provider_connections
SET agency_id = 'ISG Retail',
    owner_id = 'ISG Retail',
    updated_at = NOW()
WHERE agency_id = 'PT1';
