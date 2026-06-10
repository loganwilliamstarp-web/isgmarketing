-- Migration: master-admin variant of the email-driven Sold metric
--
-- Same definition as get_email_driven_sold (new-business policy effective in
-- the window + a non-bounced email to the customer in the 90 days up to the
-- policy start), but platform-wide (no owner filter) and with the agency
-- breakdown + recent list the master admin dashboard shows.
--
-- Replaces the client-side getSoldAccounts() logic, which used a different
-- definition (any customer account that ever received an email) and silently
-- undercounted because the unpaginated accounts query is capped at 1000 rows.

DROP FUNCTION IF EXISTS get_email_driven_sold_master(DATE, DATE);

CREATE OR REPLACE FUNCTION get_email_driven_sold_master(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_sold BIGINT,
  by_agency JSONB,
  recent JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH sold AS (
    SELECT
      a.name           AS account_name,
      a.person_email   AS person_email,
      p.effective_date AS effective_date,
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS owner_name,
      u.profile_name   AS agency
    FROM policies p
    JOIN accounts a ON a.account_unique_id = p.account_id
    LEFT JOIN users u ON u.user_unique_id = a.owner_id
    WHERE p.policy_type ILIKE 'new business'
      AND p.account_id IS NOT NULL
      AND p.effective_date >= p_start_date
      AND p.effective_date <= p_end_date
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
        SELECT COALESCE(agency, 'Unknown') AS name, COUNT(*) AS count
        FROM sold
        GROUP BY 1
        ORDER BY 2 DESC
      ) t
    ), '[]'::jsonb) AS by_agency,
    COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT
          account_name   AS name,
          person_email   AS email,
          owner_name     AS "ownerName",
          agency,
          effective_date AS "createdAt"
        FROM sold
        ORDER BY effective_date DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb) AS recent;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_driven_sold_master(DATE, DATE)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_email_driven_sold_master IS
  'Master admin dashboard: platform-wide email-driven Sold (new-business policies preceded by a non-bounced email within 90 days), with agency breakdown and recent list.';
