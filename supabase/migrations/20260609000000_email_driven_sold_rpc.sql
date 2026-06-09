-- Migration: Sold RPC for the Pipeline report
--
-- "Sold" on the Pipeline report = new-business policies (policies.policy_type =
-- 'New Business') whose effective_date falls within the selected report window,
-- scoped to the owner's accounts (accounts.owner_id). No email condition: in
-- this data emails are only ever sent AFTER a policy is written, so a pre-sale
-- "email-driven" attribution is always zero and not meaningful. The metric is
-- therefore a straight new-business count for the period.
--
-- Done in the database (not client-side) so owner scoping joins through
-- accounts (policies.owner_id is not a reliable owner key) and the count isn't
-- affected by PostgREST's default 1000-row limit.
--
-- NOTE: policy_type is currently null for policies written after ~Feb 2026
-- (the field is not populated by the active sync). Recent-period counts stay
-- low until that classification is backfilled by the SF cron sync.

DROP FUNCTION IF EXISTS get_email_driven_sold(TEXT[], DATE, DATE, INT);
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
  'Pipeline report: count + recent list of new-business policies (policy_type = New Business) effective within [p_start_date, p_end_date], scoped to the owner''s accounts.';
