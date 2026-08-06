-- Migration: Master-admin (system-wide) "email-driven sales" reporting RPCs
--
-- The master-admin dashboard previously computed "Sold (Email-Driven)" client
-- side in getSoldAccounts(): it pulled every customer account, then queried
-- email_logs in 500-id batches to see which had been emailed. Both halves hit
-- PostgREST's 1000-row cap -- the customer list truncated past 1000 customers
-- (very likely system-wide), and a 500-account batch whose accounts collectively
-- had >1000 email_logs rows silently dropped the overflow. So "Sold" undercounted.
--
-- These are all-owners variants of get_email_driven_sales / get_recent_email_driven_sales
-- (see 20260608000001_email_driven_sales_rpc.sql): same date-bounded, new-business,
-- 90-day-attribution definition, but with NO owner filter so they aggregate across
-- every agency. "New policy in window" = a policy whose effective_date falls in
-- [start,end); "new business" excludes renewals (policy_term = 'Renewal');
-- "email-driven" = a marketing email was sent to the account in the 90 days
-- immediately before the policy effective date.
--
-- email_logs.account_id and policies.account_id both reference
-- accounts(account_unique_id), so they join directly on account_id alone. Agency
-- attribution is owner-based: policies.owner_id -> users.user_unique_id -> profile_name.

-- Aggregate counts for the period, across all owners. Returns a single row.
CREATE OR REPLACE FUNCTION get_email_driven_sales_all(
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
          AND el.sent_at IS NOT NULL
          AND el.sent_at <  p.effective_date
          AND el.sent_at >= p.effective_date - INTERVAL '90 days'
      ) AS emailed
    FROM policies p
    WHERE p.effective_date >= p_start_date
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

COMMENT ON FUNCTION get_email_driven_sales_all IS
  'System-wide (all owners) counts of new-business policies/people in [start,end) and the email-driven subset (a marketing email was sent in the 90 days before the policy effective date). Bypasses RLS for master-admin reporting.';

-- Email-driven new-business people per agency for the period (for the dashboard
-- "By Agency" panel). One row per agency, busiest first.
CREATE OR REPLACE FUNCTION get_email_driven_sales_by_agency_all(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  agency TEXT,
  email_driven_people BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(u.profile_name, 'Unknown')::TEXT AS agency,
    COUNT(DISTINCT p.account_id)::BIGINT AS email_driven_people
  FROM policies p
  LEFT JOIN users u ON u.user_unique_id = p.owner_id
  WHERE p.effective_date >= p_start_date
    AND p.effective_date < p_end_date
    AND p.policy_term IS DISTINCT FROM 'Renewal'
    AND EXISTS (
      SELECT 1
      FROM email_logs el
      WHERE el.account_id = p.account_id
        AND el.sent_at IS NOT NULL
        AND el.sent_at <  p.effective_date
        AND el.sent_at >= p.effective_date - INTERVAL '90 days'
    )
  GROUP BY COALESCE(u.profile_name, 'Unknown')
  ORDER BY email_driven_people DESC;
END;
$$;

COMMENT ON FUNCTION get_email_driven_sales_by_agency_all IS
  'System-wide email-driven new-business people in [start,end) grouped by owning agency (users.profile_name). Bypasses RLS for master-admin reporting.';

-- Recent email-driven new-business sales for the period, across all owners.
-- One row per emailed new-business policy, newest first, with owning agency.
CREATE OR REPLACE FUNCTION get_recent_email_driven_sales_all(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  account_id TEXT,
  name TEXT,
  person_email TEXT,
  policy_number TEXT,
  effective_date TIMESTAMPTZ,
  agency TEXT
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
    p.effective_date::TIMESTAMPTZ,
    COALESCE(u.profile_name, 'Unknown')::TEXT AS agency
  FROM policies p
  JOIN accounts a ON a.account_unique_id = p.account_id
  LEFT JOIN users u ON u.user_unique_id = p.owner_id
  WHERE p.effective_date >= p_start_date
    AND p.effective_date < p_end_date
    AND p.policy_term IS DISTINCT FROM 'Renewal'
    AND EXISTS (
      SELECT 1
      FROM email_logs el
      WHERE el.account_id = p.account_id
        AND el.sent_at IS NOT NULL
        AND el.sent_at <  p.effective_date
        AND el.sent_at >= p.effective_date - INTERVAL '90 days'
    )
  ORDER BY p.effective_date DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_recent_email_driven_sales_all IS
  'System-wide recent email-driven new-business policies in [start,end), newest first, with owning agency. Bypasses RLS for master-admin reporting.';

GRANT EXECUTE ON FUNCTION get_email_driven_sales_all(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_email_driven_sales_by_agency_all(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_recent_email_driven_sales_all(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO anon, authenticated, service_role;
