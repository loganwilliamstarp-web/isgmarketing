// supabase/functions/email-oauth/index.ts
// Edge function for managing Gmail and Microsoft 365 OAuth connections
// Used for inbox injection feature - replies are injected into user's actual inbox

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// OAuth Configuration
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile'
]

const MICROSOFT_SCOPES = [
  'Mail.ReadWrite',
  'User.Read',
  'offline_access'
]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    // Support both query-param routing and path-based routing
    // Path-based: /email-oauth/gmail/callback or /email-oauth/microsoft/callback
    // Query-based: /email-oauth?action=callback&provider=gmail
    const pathParts = url.pathname.split('/').filter(Boolean)
    let action = url.searchParams.get('action')
    let provider = url.searchParams.get('provider')

    // Check for path-based routing (for OAuth callbacks that can't have query strings)
    // Path format: /functions/v1/email-oauth/gmail/callback
    if (pathParts.length >= 4) {
      const funcIndex = pathParts.indexOf('email-oauth')
      if (funcIndex !== -1 && pathParts.length > funcIndex + 2) {
        provider = pathParts[funcIndex + 1] // gmail or microsoft
        action = pathParts[funcIndex + 2]   // callback
      }
    }

    // Create Supabase admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    switch (action) {
      case 'initiate':
        return handleInitiate(provider, url)

      case 'callback':
        return await handleCallback(provider, url, supabaseAdmin)

      case 'status':
        return await handleStatus(req, supabaseAdmin)

      case 'disconnect':
        return await handleDisconnect(req, supabaseAdmin, provider)

      case 'refresh':
        return await handleRefresh(req, supabaseAdmin, provider)

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Valid actions: initiate, callback, status, disconnect, refresh' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error: any) {
    console.error('Email OAuth error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// OAuth Flow Handlers
// ============================================================================

/**
 * Build the redirect URI for OAuth callbacks
 * Uses path-based routing to avoid query string issues with Azure AD
 * Format: https://PROJECT.supabase.co/functions/v1/email-oauth/{provider}/callback
 */
function getRedirectUri(provider: string): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('SUPABASE_URL not configured')
  return `${supabaseUrl}/functions/v1/email-oauth/${provider}/callback`
}

/**
 * Initiate OAuth flow - redirects user to provider's authorization page
 */
function handleInitiate(provider: string | null, url: URL): Response {
  const state = url.searchParams.get('state')

  if (!state) {
    return new Response(
      JSON.stringify({ error: 'Missing state parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (provider === 'gmail') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Google OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const redirectUri = getRedirectUri('gmail')
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GMAIL_SCOPES.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent') // Force consent to get refresh token
    authUrl.searchParams.set('state', state)

    return Response.redirect(authUrl.toString(), 302)
  }

  if (provider === 'microsoft') {
    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Microsoft OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const redirectUri = getRedirectUri('microsoft')
    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', MICROSOFT_SCOPES.join(' '))
    authUrl.searchParams.set('state', state)

    return Response.redirect(authUrl.toString(), 302)
  }

  return new Response(
    JSON.stringify({ error: 'Invalid provider. Use gmail or microsoft' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Handle OAuth callback - exchange code for tokens and store
 */
async function handleCallback(
  provider: string | null,
  url: URL,
  supabase: any
): Promise<Response> {
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://app.isgmarketing.com'

  // Handle OAuth errors
  if (error) {
    const errorDescription = url.searchParams.get('error_description') || error
    return Response.redirect(
      `${frontendUrl}/settings?tab=integrations&oauth=error&error=${encodeURIComponent(errorDescription)}`,
      302
    )
  }

  if (!code || !stateParam) {
    return Response.redirect(
      `${frontendUrl}/settings?tab=integrations&oauth=error&error=missing_code`,
      302
    )
  }

  // Parse state
  let state: { owner_id: string; redirect_after?: string }
  try {
    state = JSON.parse(stateParam)
  } catch {
    return Response.redirect(
      `${frontendUrl}/settings?tab=integrations&oauth=error&error=invalid_state`,
      302
    )
  }

  const { owner_id, redirect_after } = state

  try {
    let tokens: { access_token: string; refresh_token: string; expires_in: number }
    let userEmail: string
    let userId: string | null = null

    if (provider === 'gmail') {
      tokens = await exchangeGoogleCode(code)
      const userInfo = await getGoogleUserInfo(tokens.access_token)
      userEmail = userInfo.email
      userId = userInfo.id
    } else if (provider === 'microsoft') {
      tokens = await exchangeMicrosoftCode(code)
      const userInfo = await getMicrosoftUserInfo(tokens.access_token)
      userEmail = userInfo.email
      userId = userInfo.id
    } else {
      throw new Error('Invalid provider')
    }

    // Encrypt tokens
    const encryptedAccessToken = await encryptToken(tokens.access_token)
    const encryptedRefreshToken = await encryptToken(tokens.refresh_token)

    // Store in database (upsert)
    const { error: dbError } = await supabase
      .from('email_provider_connections')
      .upsert({
        owner_id,
        provider,
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        provider_email: userEmail,
        provider_user_id: userId,
        scopes: provider === 'gmail' ? GMAIL_SCOPES : MICROSOFT_SCOPES,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'owner_id,provider'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to store connection')
    }

    // Redirect back to frontend
    const redirectPath = redirect_after || '/settings?tab=integrations'
    return Response.redirect(
      `${frontendUrl}${redirectPath}${redirectPath.includes('?') ? '&' : '?'}oauth=success&provider=${provider}`,
      302
    )

  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return Response.redirect(
      `${frontendUrl}/settings?tab=integrations&oauth=error&error=${encodeURIComponent(err.message)}`,
      302
    )
  }
}

/**
 * Get OAuth connection status for a user
 */
async function handleStatus(req: Request, supabase: any): Promise<Response> {
  const url = new URL(req.url)
  const ownerId = url.searchParams.get('owner_id')

  if (!ownerId) {
    return new Response(
      JSON.stringify({ error: 'Missing owner_id parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data, error } = await supabase
    .from('email_provider_connections')
    .select('provider, provider_email, status, last_error, last_used_at, created_at, updated_at')
    .eq('owner_id', ownerId)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Format response
  const connections: Record<string, any> = {
    gmail: null,
    microsoft: null
  }

  for (const conn of data || []) {
    connections[conn.provider] = {
      email: conn.provider_email,
      status: conn.status,
      lastError: conn.last_error,
      lastUsedAt: conn.last_used_at,
      connectedAt: conn.created_at
    }
  }

  return new Response(
    JSON.stringify({ connections }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Disconnect an OAuth provider
 */
async function handleDisconnect(
  req: Request,
  supabase: any,
  provider: string | null
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const body = await req.json()
  const { owner_id } = body

  if (!owner_id || !provider) {
    return new Response(
      JSON.stringify({ error: 'Missing owner_id or provider' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get current connection to revoke token
  const { data: connection } = await supabase
    .from('email_provider_connections')
    .select('access_token_encrypted, refresh_token_encrypted')
    .eq('owner_id', owner_id)
    .eq('provider', provider)
    .single()

  if (connection) {
    // Attempt to revoke tokens with provider
    try {
      const accessToken = await decryptToken(connection.access_token_encrypted)

      if (provider === 'gmail') {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
          method: 'POST'
        })
      } else if (provider === 'microsoft') {
        // Microsoft doesn't have a simple revoke endpoint for delegated permissions
        // The token will just expire
      }
    } catch (err) {
      console.warn('Failed to revoke token:', err)
    }
  }

  // Delete from database
  const { error } = await supabase
    .from('email_provider_connections')
    .delete()
    .eq('owner_id', owner_id)
    .eq('provider', provider)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Manually refresh an OAuth token
 */
async function handleRefresh(
  req: Request,
  supabase: any,
  provider: string | null
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const body = await req.json()
  const { owner_id } = body

  if (!owner_id || !provider) {
    return new Response(
      JSON.stringify({ error: 'Missing owner_id or provider' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get current connection
  const { data: connection, error: fetchError } = await supabase
    .from('email_provider_connections')
    .select('*')
    .eq('owner_id', owner_id)
    .eq('provider', provider)
    .single()

  if (fetchError || !connection) {
    return new Response(
      JSON.stringify({ error: 'Connection not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const refreshToken = await decryptToken(connection.refresh_token_encrypted)
    let newTokens: { access_token: string; refresh_token?: string; expires_in: number }

    if (provider === 'gmail') {
      newTokens = await refreshGoogleToken(refreshToken)
    } else if (provider === 'microsoft') {
      newTokens = await refreshMicrosoftToken(refreshToken)
    } else {
      throw new Error('Invalid provider')
    }

    // Encrypt new tokens
    const encryptedAccessToken = await encryptToken(newTokens.access_token)
    const encryptedRefreshToken = newTokens.refresh_token
      ? await encryptToken(newTokens.refresh_token)
      : connection.refresh_token_encrypted

    // Update database
    const { error: updateError } = await supabase
      .from('email_provider_connections')
      .update({
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', owner_id)
      .eq('provider', provider)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    // Update status to error
    await supabase
      .from('email_provider_connections')
      .update({
        status: 'error',
        last_error: err.message,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', owner_id)
      .eq('provider', provider)

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// ============================================================================
// Google OAuth Helpers
// ============================================================================

async function exchangeGoogleCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri('gmail')
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token exchange failed: ${error}`)
  }

  return response.json()
}

async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token refresh failed: ${error}`)
  }

  return response.json()
}

async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string
  email: string
}> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    throw new Error('Failed to get Google user info')
  }

  return response.json()
}

// ============================================================================
// Microsoft OAuth Helpers
// ============================================================================

async function exchangeMicrosoftCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri('microsoft'),
      scope: MICROSOFT_SCOPES.join(' ')
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Microsoft token exchange failed: ${error}`)
  }

  return response.json()
}

async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' ')
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Microsoft token refresh failed: ${error}`)
  }

  return response.json()
}

async function getMicrosoftUserInfo(accessToken: string): Promise<{
  id: string
  email: string
}> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    throw new Error('Failed to get Microsoft user info')
  }

  const data = await response.json()
  return {
    id: data.id,
    email: data.mail || data.userPrincipalName
  }
}

// ============================================================================
// Token Encryption Helpers (AES-256-GCM)
// ============================================================================

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured')
  }

  const keyBytes = hexToBytes(keyHex)
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(token)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  // Combine IV + encrypted data and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptToken(encryptedBase64: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))

  const iv = combined.slice(0, IV_LENGTH)
  const encrypted = combined.slice(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted
  )

  return new TextDecoder().decode(decrypted)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// ============================================================================
// Exported helpers for use by other edge functions (inbox injection)
// ============================================================================

export {
  decryptToken,
  encryptToken,
  refreshGoogleToken,
  refreshMicrosoftToken,
  GMAIL_SCOPES,
  MICROSOFT_SCOPES
}
