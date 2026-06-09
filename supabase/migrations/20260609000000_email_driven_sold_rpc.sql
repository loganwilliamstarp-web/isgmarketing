-- Migration: Email-driven sold RPC for the Pipeline report
--
-- "Sold (Email-Driven)" = new-business policies (policies.policy_type = 'New
-- Business') whose effective_date falls within the selected report window AND
-- whose account received a tracked email within p_attribution_days before the
-- effective date. Owner scoping is done through email_logs.owner_id (the email
-- that drove the sale), consistent with the other pipeline metrics.
--
-- Done in the database (not client-side) so the join isn't truncated by
-- PostgREST's default 1000-row limit and isn't broken by policies.owner_id,
-- which is not a reliable owner key in this schema.

DROP FUNCTION IF EXISTS get_email_driven_sold(TEXT[], DATE, DATE, INT);

CREATE OR REPLACE FUNCTION get_email_driven_sold(
  p_owner_ids TEXT[],
  p_start_date DATE,
  p_end_date DATE,
  p_attribution_days INT DEFAULT 90
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
    LEFT JOIN accounts a ON a.account_unique_id = p.account_id
    WHERE p.policy_type ILIKE 'new business'
      AND p.account_id IS NOT NULL
      AND p.effective_date >= p_start_date
      AND p.effective_date <= p_end_date
      AND EXISTS (
        SELECT 1
        FROM email_logs e
        WHERE e.account_id = p.account_id
          AND e.owner_id = ANY(p_owner_ids)
          AND e.sent_at IS NOT NULL
          AND e.sent_at <  (p.effective_date + INTERVAL '1 day')
          AND e.sent_at >= (p.effective_date::timestamptz - make_interval(days => p_attribution_days))
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

GRANT EXECUTE ON FUNCTION get_email_driven_sold(TEXT[], DATE, DATE, INT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_email_driven_sold IS
  'Pipeline report: count + recent list of new-business policies (policy_type = New Business) effective within [p_start_date, p_end_date] whose account received an owner email within p_attribution_days before the effective date.';
