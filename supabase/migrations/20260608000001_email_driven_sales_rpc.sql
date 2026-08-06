-- Migration: Accurate, date-bounded "email-driven sales" reporting RPCs
--
-- Replaces the old client-side computation in getPipelineReport, which pulled
-- raw email_logs to the browser with no .limit()/.order(). PostgREST caps that
-- at 1000 rows in arbitrary order, so the "Sold (Email-Driven)" number was both
-- undercounted and unstable between refetches (e.g. 6 one load, 5 the next).
--
-- These functions answer the real question server-side: how many people bought
-- NEW business in a given window whose purchase was PRECEDED by a marketing
-- email within a 90-day attribution lookback. "New policy in window" = a policy
-- whose effective_date falls in the window; "new business" excludes renewals
-- (policy_term = 'Renewal'). If an agency does not populate policy_term, the
-- renewal filter is a no-op and the numbers fall back to all policies effective
-- in the window. "Email-driven" = a marketing email was sent to the account in
-- the 90 days immediately before the policy effective date.
--
-- email_logs.account_id and policies.account_id both reference
-- accounts(account_unique_id) (the Salesforce Account Id), so they join directly.

-- Aggregate counts for the period. Returns a single row.
CREATE OR REPLACE FUNCTION get_email_driven_sales(
  p_owner_ids TEXT[],
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  new_business_policies BIGINT,
  email_driven_policies BIGINT,
  new_business_people BIGINT,
  email_driven_people BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH window_policies AS (
    SELECT
      p.account_id,
      EXISTS (
        SELECT 1
        FROM email_logs el
        WHERE el.account_id = p.account_id
          AND el.owner_id = ANY(p_owner_ids)
          AND el.sent_at IS NOT NULL
          AND el.sent_at <  p.effective_date
          AND el.sent_at >= p.effective_date - INTERVAL '90 days'
      ) AS emailed
    FROM policies p
    WHERE p.owner_id = ANY(p_owner_ids)
      AND p.effective_date >= p_start_date
      AND p.effective_date < p_end_date
      AND p.policy_term IS DISTINCT FROM 'Renewal'
  )
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE emailed)::BIGINT,
    COUNT(DISTINCT account_id)::BIGINT,
    COUNT(DISTINCT account_id) FILTER (WHERE emailed)::BIGINT
  FROM window_policies;
END;
$$;

COMMENT ON FUNCTION get_email_driven_sales IS
  'Counts new-business policies/people in [start,end) and the email-driven subset (a marketing email was sent in the 90 days before the policy effective date). Bypasses RLS for efficient multi-owner reporting.';

-- Recent email-driven new-business sales for the period (for the UI list).
-- One row per emailed new-business policy, newest first.
CREATE OR REPLACE FUNCTION get_recent_email_driven_sales(
  p_owner_ids TEXT[],
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  account_id TEXT,
  name TEXT,
  person_email TEXT,
  policy_number TEXT,
  effective_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.account_id,
    a.name,
    a.person_email,
    p.policy_number,
    p.effective_date::TIMESTAMPTZ
  FROM policies p
  JOIN accounts a ON a.account_unique_id = p.account_id
  WHERE p.owner_id = ANY(p_owner_ids)
    AND p.effective_date >= p_start_date
    AND p.effective_date < p_end_date
    AND p.policy_term IS DISTINCT FROM 'Renewal'
    AND EXISTS (
      SELECT 1
      FROM email_logs el
      WHERE el.account_id = p.account_id
        AND el.owner_id = ANY(p_owner_ids)
        AND el.sent_at IS NOT NULL
        AND el.sent_at <  p.effective_date
        AND el.sent_at >= p.effective_date - INTERVAL '90 days'
    )
  ORDER BY p.effective_date DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_recent_email_driven_sales IS
  'Recent email-driven new-business policies in [start,end), newest first. Bypasses RLS for efficient multi-owner reporting.';

GRANT EXECUTE ON FUNCTION get_email_driven_sales(TEXT[], TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_recent_email_driven_sales(TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INT) TO anon, authenticated, service_role;
