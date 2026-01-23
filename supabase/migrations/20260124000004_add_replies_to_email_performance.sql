-- Migration: Add first_replied_at to email performance RPC

DROP FUNCTION IF EXISTS get_email_performance(TEXT[], TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_email_performance(
  p_owner_ids TEXT[],
  p_start_date TIMESTAMPTZ
)
RETURNS TABLE (
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  first_clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  first_replied_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.sent_at,
    e.delivered_at,
    e.first_opened_at,
    e.first_clicked_at,
    e.bounced_at,
    e.first_replied_at
  FROM email_logs e
  WHERE e.owner_id = ANY(p_owner_ids)
    AND e.sent_at >= p_start_date;
END;
$$;

COMMENT ON FUNCTION get_email_performance IS 'Get email performance data for multiple owners including reply tracking.';
