// supabase/functions/_shared/microsoftAppOnly.ts
// App-only (client credentials) Microsoft Graph tokens for tenants whose admin
// has consented to the app organization-wide. Requires the Graph *application*
// permission Mail.ReadWrite on the app registration.

// Cached per tenant for the life of the isolate; refreshed a minute early.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getAppOnlyGraphToken(tenant: string): Promise<string> {
  const cached = tokenCache.get(tenant)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Microsoft OAuth not configured')

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`app-only token request failed: ${response.status} - ${errorText.slice(0, 300)}`)
  }

  const data = await response.json()
  tokenCache.set(tenant, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

/**
 * Confirm the app-only token can open this mailbox's inbox. Fails when the
 * application permission is missing or the mailbox isn't in the tenant.
 */
export async function verifyMailboxAccess(tenant: string, mailbox: string): Promise<void> {
  const token = await getAppOnlyGraphToken(tenant)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`mailbox check failed for ${mailbox}: ${response.status} - ${errorText.slice(0, 300)}`)
  }
}
