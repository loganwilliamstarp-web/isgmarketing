// supabase/functions/sendgrid-inbound-parse/logic.ts
//
// Pure helpers for tenant-wide (app-only) Microsoft inbox injection.
//
// This module MUST stay dependency-free (no Deno/Node APIs, no imports) so it
// can be exercised by both the Deno edge runtime (imported from index.ts) and
// the repo's Vitest suite (logic.test.ts).

/**
 * Parse MICROSOFT_APP_ONLY_DOMAINS into a domain -> tenant map.
 *
 * Format: comma-separated entries, each either `domain` or `domain=tenantId`.
 *   "isgdfw.com"                       -> tenant "isgdfw.com"
 *   "isgdfw.com=0000-guid, other.com"  -> explicit tenant for isgdfw.com
 * A bare domain works as the tenant because Microsoft accepts any verified
 * domain of a tenant in the token endpoint path.
 */
export function parseAppOnlyDomains(raw: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!raw) return map
  for (const entry of raw.split(',')) {
    const [domainPart, tenantPart] = entry.split('=')
    const domain = domainPart?.trim().toLowerCase()
    if (!domain) continue
    const tenant = tenantPart?.trim() || domain
    map.set(domain, tenant)
  }
  return map
}

/**
 * Tenant to request an app-only token from for this mailbox, or null when the
 * mailbox's domain isn't enabled for tenant-wide injection.
 */
export function appOnlyTenantFor(
  mailbox: string | undefined | null,
  domains: Map<string, string>
): string | null {
  const domain = mailbox?.split('@')[1]?.trim().toLowerCase()
  if (!domain) return null
  return domains.get(domain) ?? null
}

/**
 * Graph endpoint for creating a message in an inbox. With a mailbox (app-only
 * token) it targets that user; without one (delegated token) it targets /me.
 */
export function graphInboxMessagesUrl(mailbox?: string | null): string {
  const base = 'https://graph.microsoft.com/v1.0'
  return mailbox
    ? `${base}/users/${encodeURIComponent(mailbox.trim())}/mailFolders/inbox/messages`
    : `${base}/me/mailFolders/inbox/messages`
}
