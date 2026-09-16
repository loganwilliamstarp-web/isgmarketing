// src/utils/optimalSendTime.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter } from '../services/utils/ownerFilter';

// Chunk size for .in() filters to keep request URLs under length limits
const IN_FILTER_CHUNK_SIZE = 200;

// Allowed send window (hour of day, inclusive)
const MIN_SEND_HOUR = 8;
const MAX_SEND_HOUR = 18;

// Default hour when there is not enough engagement data anywhere
const DEFAULT_FALLBACK_HOUR = 10;

// Minimum opens required to trust a per-account modal hour
const MIN_OPENS_PER_ACCOUNT = 2;

// Minimum opens required to trust the global modal hour
const MIN_OPENS_GLOBAL = 5;

const clampHour = (hour) => Math.min(MAX_SEND_HOUR, Math.max(MIN_SEND_HOUR, hour));

/**
 * Find the modal (most frequent) hour among a list of opens.
 * Ties are broken by the hour with the most recent open.
 * @param {{ hour: number, ts: number }[]} opens
 * @returns {number} hour of day (0-23)
 */
const modalHour = (opens) => {
  const stats = new Map(); // hour -> { count, latestTs }
  for (const { hour, ts } of opens) {
    const entry = stats.get(hour) || { count: 0, latestTs: 0 };
    entry.count += 1;
    if (ts > entry.latestTs) entry.latestTs = ts;
    stats.set(hour, entry);
  }
  let best = null;
  for (const [hour, { count, latestTs }] of stats) {
    if (
      !best ||
      count > best.count ||
      (count === best.count && latestTs > best.latestTs)
    ) {
      best = { hour, count, latestTs };
    }
  }
  return best.hour;
};

/**
 * Compute the optimal send hour per account from historical email-open data.
 *
 * Timezone assumption: hours are derived with `new Date(ts).getHours()`, i.e.
 * the browser's LOCAL timezone. This is intentional — the agency's clientele
 * is regional, so the user's local clock is a reasonable proxy for every
 * recipient's clock. If the book of business ever spans multiple timezones,
 * per-recipient timezone data would be needed for true accuracy.
 *
 * Fallback chain:
 * 1. Account has >= 2 recorded opens: modal hour-of-day of those opens
 *    (ties broken by most recent open).
 * 2. Otherwise: global modal hour across ALL fetched opens (requires >= 5
 *    data points).
 * 3. Otherwise: 10 (10 AM).
 * All hours are clamped into the 8-18 send window.
 *
 * @param {string[]} accountIds - account_unique_id values for the recipients
 * @param {string|string[]} ownerIds - owner ID(s) for multi-tenancy filtering
 * @returns {Promise<{ hoursByAccount: Map<string, number>, fallbackHour: number }>}
 */
export async function computeOptimalSendHours(accountIds, ownerIds) {
  const hoursByAccount = new Map();
  const uniqueIds = [...new Set((accountIds || []).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { hoursByAccount, fallbackHour: DEFAULT_FALLBACK_HOUR };
  }

  // Fetch open history in chunks to avoid URL length limits on .in()
  const allRows = [];
  for (let i = 0; i < uniqueIds.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + IN_FILTER_CHUNK_SIZE);
    let query = supabase
      .from('email_logs')
      .select('account_id, first_opened_at')
      .not('first_opened_at', 'is', null)
      .in('account_id', chunk);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;
    if (error) {
      console.warn('Failed to fetch open history for send-time optimization:', error);
      continue;
    }
    if (data) allRows.push(...data);
  }

  // Group opens by account
  const opensByAccount = new Map();
  const allOpens = [];
  for (const row of allRows) {
    const ts = new Date(row.first_opened_at).getTime();
    if (Number.isNaN(ts)) continue;
    // LOCAL hour-of-day (see timezone assumption in the JSDoc above)
    const open = { hour: new Date(ts).getHours(), ts };
    allOpens.push(open);
    if (!opensByAccount.has(row.account_id)) {
      opensByAccount.set(row.account_id, []);
    }
    opensByAccount.get(row.account_id).push(open);
  }

  for (const [accountId, opens] of opensByAccount) {
    if (opens.length >= MIN_OPENS_PER_ACCOUNT) {
      hoursByAccount.set(accountId, clampHour(modalHour(opens)));
    }
  }

  const fallbackHour = allOpens.length >= MIN_OPENS_GLOBAL
    ? clampHour(modalHour(allOpens))
    : DEFAULT_FALLBACK_HOUR;

  return { hoursByAccount, fallbackHour };
}

export default computeOptimalSendHours;
