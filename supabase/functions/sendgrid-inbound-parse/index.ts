// supabase/functions/sendgrid-inbound-parse/index.ts
// Webhook handler for SendGrid Inbound Parse
// Receives email replies and links them to original sent emails
// Reply-To format: reply-{email_log_id}@isg-replies.com
//
// Flow:
// 1. Parse incoming email
// 2. Extract email_log_id from To address (reply-{id}@domain)
// 3. Store reply in email_replies table (for metrics)
// 4. Inject reply into sender's inbox via OAuth (Gmail/Microsoft)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Token encryption helpers (same as email-oauth function)
const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured')
  }
  const keyBytes = hexToBytes(keyHex)
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, ['decrypt'])
}

async function decryptToken(encryptedBase64: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LENGTH)
  const encrypted = combined.slice(IV_LENGTH)
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encrypted)
  return new TextDecoder().decode(decrypted)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ParsedEmail {
  to: string
  from: string
  fromName?: string
  subject: string
  text?: string
  html?: string
  headers: string
  inReplyTo?: string
  messageId?: string
  references?: string
  attachments?: number
  attachmentsInfo?: any[]
  spf?: string
  dkim?: string
  spamScore?: number
}

serve(async (req) => {
  // Log immediately on any request to confirm webhook is being called
  console.log('=== SendGrid Inbound Parse Called ===', {
    method: req.method,
    url: req.url,
    contentType: req.headers.get('content-type')
  })

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // SendGrid sends multipart/form-data
    const formData = await req.formData()
    console.log('Form data fields:', [...formData.keys()])

    // Parse the email data from form fields
    const email = parseFormData(formData)

    console.log(`Received inbound email from: ${email.from} to: ${email.to}`)

    // Parse headers to extract threading info
    const headers = parseHeaders(email.headers)
    const inReplyTo = headers['in-reply-to'] || email.inReplyTo

    // Look up the original email
    // Method 1: Parse email_log_id from To address (reply-{id}@mailbox-replies.com)
    // Method 2: Use In-Reply-To header with our custom Message-ID format
    let emailLogId: number | null = null
    let ownerId: string | null = null
    let accountId: string | null = null

    // Try to extract email_log_id from the To address first
    // Format: reply-{email_log_id}@isg-replies.com
    const toAddressMatch = email.to.match(/reply-(\d+)@/i)
    if (toAddressMatch) {
      const parsedId = parseInt(toAddressMatch[1], 10)
      const { data: emailLog } = await supabaseClient
        .from('email_logs')
        .select('id, owner_id, account_id, to_email')
        .eq('id', parsedId)
        .single()

      if (emailLog) {
        emailLogId = emailLog.id
        ownerId = emailLog.owner_id
        accountId = emailLog.account_id
        console.log(`Matched reply to email_log ${emailLogId} via To address format`)
      }
    }

    // Fallback: Try In-Reply-To header
    if (!emailLogId && inReplyTo) {
      // Try to match via custom_message_id (our custom Message-ID)
      const { data: originalEmail } = await supabaseClient
        .from('email_logs')
        .select('id, owner_id, account_id, to_email')
        .eq('custom_message_id', inReplyTo.trim())
        .single()

      if (originalEmail) {
        emailLogId = originalEmail.id
        ownerId = originalEmail.owner_id
        accountId = originalEmail.account_id
        console.log(`Matched reply to email_log ${emailLogId} via In-Reply-To header`)

        // Verify the reply is from the expected recipient
        if (!verifyReplyFrom(email.from, originalEmail.to_email)) {
          console.warn(`Reply from ${email.from} doesn't match original recipient ${originalEmail.to_email}`)
          // Still store it but log the mismatch
        }
      } else {
        // Try extracting ID from our custom format: <isg-{id}-{timestamp}@domain>
        const match = inReplyTo.match(/<isg-(\d+)-\d+@/)
        if (match) {
          const parsedId = parseInt(match[1], 10)
          const { data: emailLog } = await supabaseClient
            .from('email_logs')
            .select('id, owner_id, account_id, to_email')
            .eq('id', parsedId)
            .single()

          if (emailLog) {
            emailLogId = emailLog.id
            ownerId = emailLog.owner_id
            accountId = emailLog.account_id
            console.log(`Matched reply to email_log ${emailLogId} via parsed Message-ID`)
          }
        }
      }
    }

    // If we still couldn't find owner, try to find from the domain
    if (!ownerId) {
      ownerId = await findOwnerFromDomain(supabaseClient, email.to)
    }

    if (!ownerId) {
      console.error('Could not determine owner for inbound email')
      // Return 200 to prevent SendGrid retries - we can't process this
      return new Response(
        JSON.stringify({ success: false, error: 'Could not determine owner' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store the reply
    const { data: reply, error: insertError } = await supabaseClient
      .from('email_replies')
      .insert({
        owner_id: ownerId,
        email_log_id: emailLogId,
        account_id: accountId,
        from_email: email.from,
        from_name: email.fromName,
        to_email: email.to,
        subject: email.subject,
        body_text: email.text,
        body_html: email.html,
        in_reply_to: headers['in-reply-to'] || email.inReplyTo,
        message_id: headers['message-id'] || email.messageId,
        references_header: headers['references'] || email.references,
        attachment_count: email.attachments || 0,
        attachments_info: email.attachmentsInfo || [],
        spf: email.spf,
        dkim: email.dkim,
        spam_score: email.spamScore,
        raw_headers: headers,
        received_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error storing reply:', insertError)
      throw insertError
    }

    console.log(`Stored reply ${reply?.id} for email_log ${emailLogId}`)

    // Note: The trigger will automatically update email_logs with reply stats

    // Attempt inbox injection if user has OAuth connected
    if (ownerId && reply?.id) {
      const injectionResult = await attemptInboxInjection(supabaseClient, {
        replyId: reply.id,
        ownerId,
        fromEmail: email.from,
        fromName: email.fromName,
        subject: email.subject,
        bodyText: email.text,
        bodyHtml: email.html,
        receivedAt: new Date().toISOString()
      })
      console.log(`Inbox injection result:`, injectionResult)
    }

    return new Response(
      JSON.stringify({
        success: true,
        reply_id: reply?.id,
        email_log_id: emailLogId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Inbound parse error:', error)
    // Return 200 even on error to prevent infinite retries
    // SendGrid will retry on 4xx/5xx status codes
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function parseFormData(formData: FormData): ParsedEmail {
  // SendGrid Inbound Parse field names
  // https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook

  const to = formData.get('to') as string || ''
  const fromFull = formData.get('from') as string || ''

  // Parse "Name <email@domain.com>" format
  const fromMatch = fromFull.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/)
  const fromName = fromMatch?.[1]?.trim()
  const from = fromMatch?.[2]?.trim() || fromFull

  // Get attachment info
  let attachments = 0
  let attachmentsInfo: any[] = []

  const attachmentsCount = formData.get('attachments')
  if (attachmentsCount) {
    attachments = parseInt(attachmentsCount as string, 10) || 0
    // Parse attachment info JSON if present
    const attachmentInfo = formData.get('attachment-info')
    if (attachmentInfo) {
      try {
        attachmentsInfo = JSON.parse(attachmentInfo as string)
      } catch (e) {
        console.warn('Could not parse attachment-info')
      }
    }
  }

  return {
    to,
    from,
    fromName,
    subject: formData.get('subject') as string || '(no subject)',
    text: formData.get('text') as string || undefined,
    html: formData.get('html') as string || undefined,
    headers: formData.get('headers') as string || '',
    inReplyTo: formData.get('In-Reply-To') as string || undefined,
    messageId: formData.get('Message-ID') as string || undefined,
    references: formData.get('References') as string || undefined,
    attachments,
    attachmentsInfo,
    spf: formData.get('SPF') as string || undefined,
    dkim: formData.get('dkim') as string || undefined,
    spamScore: parseFloat(formData.get('spam_score') as string) || undefined,
  }
}

function verifyReplyFrom(replyFrom: string, originalTo: string): boolean {
  // Normalize emails for comparison (lowercase, trim)
  const normalizedReply = replyFrom.toLowerCase().trim()
  const normalizedOriginal = originalTo.toLowerCase().trim()

  // Exact match
  if (normalizedReply === normalizedOriginal) {
    return true
  }

  // Could add fuzzy matching for forwarded emails, aliases, etc.
  // For now, just check if the domain matches
  const replyDomain = normalizedReply.split('@')[1]
  const originalDomain = normalizedOriginal.split('@')[1]

  return replyDomain === originalDomain
}

async function findOwnerFromDomain(supabase: any, toAddress: string): Promise<string | null> {
  // Extract domain from parse address
  // Format: reply+xxx@parse.domain.com or reply+xxx@domain.com

  const emailMatch = toAddress.match(/<([^>]+)>/) || [null, toAddress]
  const email = (emailMatch[1] || toAddress).toLowerCase()

  // Get the domain part
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return null

  let domain = email.substring(atIndex + 1)

  // Remove parse. prefix if present
  if (domain.startsWith('parse.')) {
    domain = domain.substring(6)
  }

  // Look up the domain in sender_domains
  const { data: senderDomain } = await supabase
    .from('sender_domains')
    .select('owner_id')
    .eq('domain', domain)
    .eq('inbound_parse_enabled', true)
    .single()

  return senderDomain?.owner_id || null
}

function parseHeaders(headersString: string): Record<string, string> {
  const headers: Record<string, string> = {}

  if (!headersString) return headers

  // Headers are newline-separated, with possible line continuations
  const lines = headersString.split(/\r?\n/)
  let currentKey = ''
  let currentValue = ''

  for (const line of lines) {
    // Line continuation (starts with whitespace)
    if (line.match(/^\s+/) && currentKey) {
      currentValue += ' ' + line.trim()
      continue
    }

    // Save previous header
    if (currentKey) {
      headers[currentKey.toLowerCase()] = currentValue
    }

    // Parse new header
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      currentKey = line.substring(0, colonIndex).trim()
      currentValue = line.substring(colonIndex + 1).trim()
    }
  }

  // Save last header
  if (currentKey) {
    headers[currentKey.toLowerCase()] = currentValue
  }

  return headers
}

// ============================================================================
// INBOX INJECTION - Inject replies into sender's Gmail/Microsoft inbox
// ============================================================================

interface InjectionParams {
  replyId: number
  ownerId: string
  fromEmail: string
  fromName?: string
  subject: string
  bodyText?: string
  bodyHtml?: string
  receivedAt: string
}

async function attemptInboxInjection(
  supabase: any,
  params: InjectionParams
): Promise<{ success: boolean; method?: string; error?: string }> {
  try {
    // Check if user has an active OAuth connection
    const { data: connection } = await supabase
      .from('email_provider_connections')
      .select('*')
      .eq('owner_id', params.ownerId)
      .eq('status', 'active')
      .single()

    if (!connection) {
      console.log(`No active OAuth connection for owner ${params.ownerId} - skipping injection`)
      // Update reply record to indicate no injection attempted
      await supabase
        .from('email_replies')
        .update({
          inbox_injected: false,
          inbox_injection_error: 'no_oauth_connection'
        })
        .eq('id', params.replyId)
      return { success: false, error: 'no_oauth_connection' }
    }

    // Decrypt access token
    let accessToken: string
    try {
      accessToken = await decryptToken(connection.access_token_encrypted)
    } catch (err) {
      console.error('Failed to decrypt token:', err)
      await updateInjectionStatus(supabase, params.replyId, false, connection.provider, 'token_decrypt_failed')
      return { success: false, error: 'token_decrypt_failed' }
    }

    // Check if token is expired, refresh if needed
    if (new Date(connection.token_expires_at) < new Date()) {
      console.log('Token expired, attempting refresh...')
      try {
        const refreshToken = await decryptToken(connection.refresh_token_encrypted)
        const newTokens = await refreshOAuthToken(connection.provider, refreshToken)

        // Encrypt and update tokens
        accessToken = newTokens.access_token
        const encryptedAccess = await encryptToken(newTokens.access_token)
        const encryptedRefresh = newTokens.refresh_token
          ? await encryptToken(newTokens.refresh_token)
          : connection.refresh_token_encrypted

        await supabase
          .from('email_provider_connections')
          .update({
            access_token_encrypted: encryptedAccess,
            refresh_token_encrypted: encryptedRefresh,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            status: 'active',
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id)
      } catch (refreshErr: any) {
        console.error('Token refresh failed:', refreshErr)
        await supabase
          .from('email_provider_connections')
          .update({
            status: 'expired',
            last_error: refreshErr.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id)
        await updateInjectionStatus(supabase, params.replyId, false, connection.provider, 'token_refresh_failed')
        return { success: false, error: 'token_refresh_failed' }
      }
    }

    // Inject into inbox based on provider
    let result: { success: boolean; messageId?: string; error?: string }

    if (connection.provider === 'gmail') {
      result = await injectIntoGmail(accessToken, params)
    } else if (connection.provider === 'microsoft') {
      result = await injectIntoMicrosoft(accessToken, params)
    } else {
      result = { success: false, error: 'unknown_provider' }
    }

    // Update email_replies with injection status
    await updateInjectionStatus(
      supabase,
      params.replyId,
      result.success,
      connection.provider,
      result.error
    )

    // Update last_used_at on the connection
    if (result.success) {
      await supabase
        .from('email_provider_connections')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', connection.id)
    }

    return { success: result.success, method: connection.provider, error: result.error }

  } catch (error: any) {
    console.error('Inbox injection error:', error.message)
    await supabase
      .from('email_replies')
      .update({
        inbox_injected: false,
        inbox_injection_error: error.message
      })
      .eq('id', params.replyId)
    return { success: false, error: error.message }
  }
}

async function updateInjectionStatus(
  supabase: any,
  replyId: number,
  success: boolean,
  provider: string,
  error?: string
) {
  await supabase
    .from('email_replies')
    .update({
      inbox_injected: success,
      inbox_injected_at: success ? new Date().toISOString() : null,
      inbox_injection_provider: provider,
      inbox_injection_error: error || null
    })
    .eq('id', replyId)
}

// ============================================================================
// GMAIL INJECTION - Use messages.insert API
// ============================================================================

async function injectIntoGmail(
  accessToken: string,
  params: InjectionParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Build RFC 2822 email message
    const fromHeader = params.fromName
      ? `"${params.fromName}" <${params.fromEmail}>`
      : params.fromEmail

    const emailLines = [
      `From: ${fromHeader}`,
      `To: me`,
      `Subject: ${params.subject}`,
      `Date: ${new Date(params.receivedAt).toUTCString()}`,
      `Content-Type: ${params.bodyHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
      '',
      params.bodyHtml || params.bodyText || ''
    ]

    const rawMessage = emailLines.join('\r\n')

    // Base64url encode the message
    const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Call Gmail API - messages.insert
    // https://developers.google.com/gmail/api/reference/rest/v1/users.messages/insert
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?internalDateSource=dateHeader',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedMessage,
          labelIds: ['INBOX', 'UNREAD']
        })
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log(`Gmail injection successful: ${data.id}`)
      return { success: true, messageId: data.id }
    } else {
      const errorText = await response.text()
      console.error(`Gmail API error: ${response.status} - ${errorText}`)
      return { success: false, error: `Gmail API error: ${response.status}` }
    }
  } catch (err: any) {
    console.error('Gmail injection error:', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// MICROSOFT INJECTION - Use Graph API
// ============================================================================

async function injectIntoMicrosoft(
  accessToken: string,
  params: InjectionParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Microsoft Graph API - Create message
    // https://learn.microsoft.com/en-us/graph/api/user-post-messages
    const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: params.subject,
        body: {
          contentType: params.bodyHtml ? 'HTML' : 'Text',
          content: params.bodyHtml || params.bodyText || ''
        },
        from: {
          emailAddress: {
            name: params.fromName || params.fromEmail,
            address: params.fromEmail
          }
        },
        receivedDateTime: params.receivedAt,
        isRead: false,
        isDraft: false
      })
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error(`Microsoft Graph API error: ${createResponse.status} - ${errorText}`)
      return { success: false, error: `Microsoft Graph API error: ${createResponse.status}` }
    }

    const message = await createResponse.json()

    // Move to Inbox folder
    const moveResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${message.id}/move`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationId: 'inbox'
        })
      }
    )

    if (moveResponse.ok) {
      const movedMessage = await moveResponse.json()
      console.log(`Microsoft injection successful: ${movedMessage.id}`)
      return { success: true, messageId: movedMessage.id }
    } else {
      // Message was created but couldn't be moved - still partial success
      console.log(`Microsoft injection partial success: ${message.id} (move failed)`)
      return { success: true, messageId: message.id }
    }
  } catch (err: any) {
    console.error('Microsoft injection error:', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// TOKEN REFRESH HELPERS
// ============================================================================

async function refreshOAuthToken(
  provider: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  if (provider === 'gmail') {
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
      throw new Error(`Google token refresh failed: ${response.status}`)
    }

    return response.json()
  }

  if (provider === 'microsoft') {
    const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common'
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
          client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: 'Mail.ReadWrite User.Read offline_access'
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Microsoft token refresh failed: ${response.status}`)
    }

    return response.json()
  }

  throw new Error(`Unknown provider: ${provider}`)
}

// Token encryption helper (for storing refreshed tokens)
async function encryptToken(token: string): Promise<string> {
  const keyHex = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured')
  }

  const keyBytes = hexToBytes(keyHex)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(token)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}
