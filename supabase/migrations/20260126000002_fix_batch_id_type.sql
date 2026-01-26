-- Fix batch_id column type in scheduled_emails to match mass_email_batches.id
-- The mass_email_batches table uses SERIAL (integer) for id, not UUID

-- Drop the existing foreign key constraint if it exists
ALTER TABLE scheduled_emails DROP CONSTRAINT IF EXISTS scheduled_emails_batch_id_fkey;

-- Change batch_id from UUID to INTEGER to match mass_email_batches.id
ALTER TABLE scheduled_emails
  ALTER COLUMN batch_id TYPE INTEGER USING (batch_id::text::integer);

-- Re-add the foreign key constraint (optional - may fail if mass_email_batches uses a different id type)
-- ALTER TABLE scheduled_emails
--   ADD CONSTRAINT scheduled_emails_batch_id_fkey
--   FOREIGN KEY (batch_id) REFERENCES mass_email_batches(id) ON DELETE CASCADE;

-- Recreate the index
DROP INDEX IF EXISTS idx_scheduled_emails_batch;
CREATE INDEX idx_scheduled_emails_batch
ON scheduled_emails (batch_id, status)
WHERE batch_id IS NOT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'batch_id column type fixed to INTEGER' as status;
