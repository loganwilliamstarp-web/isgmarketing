-- Migration: restore 90-day email attribution on the Pipeline report's Sold count
--
-- "Sold (Email-Driven)" = new-business policies (policies.policy_type =
-- 'New Business', now synced from Policy__c.Policy_Type__c) whose
-- effective_date falls in the report window, scoped to the owner's accounts,
-- AND where the customer received an email up to 90 days before the policy
-- started (matched by email_logs.account_id, or by to_email = the account's
-- person_email; sent and not bounced; same-day emails count).
--
-- An earlier migration dropped the email condition believing emails were only
-- ever sent after a policy was written - that was an artifact of policy_type
-- being null for all recent policies before the sync mapped it. With the
-- backfill done, ~29 of ~1,100 new-business policies in a 30-day window have
-- a qualifying prior email, so the attribution is meaningful.

DROP FUNCTION IF EXISTS get_email_driven_sold(TEXT[], DATE, DATE);

CREATE OR REPLACE FUNCTION get_email_driven_sold(
  p_owner_ids TEXT[],
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_sold BIGINT,
  recent JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH sold AS (
    SELECT
      p.account_id,
      a.name           AS account_name,
      a.person_email   AS person_email,
      p.effective_date AS effective_date
    FROM policies p
    JOIN accounts a ON a.account_unique_id = p.account_id
    WHERE p.policy_type ILIKE 'new business'
      AND p.account_id IS NOT NULL
      AND p.effective_date >= p_start_date
      AND p.effective_date <= p_end_date
      AND a.owner_id = ANY(p_owner_ids)
      AND EXISTS (
        SELECT 1
        FROM email_logs el
        WHERE (
            el.account_id = p.account_id
            OR (a.person_email IS NOT NULL AND el.to_email ILIKE a.person_email)
          )
          AND el.sent_at IS NOT NULL
          AND el.bounced_at IS NULL
          AND el.sent_at >= p.effective_date::timestamptz - INTERVAL '90 days'
          AND el.sent_at <  p.effective_date::timestamptz + INTERVAL '1 day'
      )
  )
  SELECT
    (SELECT COUNT(*) FROM sold) AS total_sold,
    COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT
          account_name   AS name,
          person_email   AS email,
          effective_date AS "createdAt"
        FROM sold
        ORDER BY effective_date DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb) AS recent;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_driven_sold(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_email_driven_sold IS
  'Pipeline report: new-business policies effective within [p_start_date, p_end_date] for the owner''s accounts, where the customer received a (non-bounced) email in the 90 days up to the policy start.';
