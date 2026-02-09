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
    let expectedSenderEmail: string | null = null
    let senderVerification: VerificationResult = { verified: false, notes: 'No original email found' }

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
        expectedSenderEmail = emailLog.to_email
        senderVerification = verifyReplyFrom(email.from, emailLog.to_email)
        console.log(`Matched reply to email_log ${emailLogId} via To address format`)
        console.log(`Sender verification: ${senderVerification.verified ? 'VERIFIED' : 'MISMATCH'} - ${senderVerification.notes}`)
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
        expectedSenderEmail = originalEmail.to_email
        senderVerification = verifyReplyFrom(email.from, originalEmail.to_email)
        console.log(`Matched reply to email_log ${emailLogId} via In-Reply-To header`)
        console.log(`Sender verification: ${senderVerification.verified ? 'VERIFIED' : 'MISMATCH'} - ${senderVerification.notes}`)
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
            expectedSenderEmail = emailLog.to_email
            senderVerification = verifyReplyFrom(email.from, emailLog.to_email)
            console.log(`Matched reply to email_log ${emailLogId} via parsed Message-ID`)
            console.log(`Sender verification: ${senderVerification.verified ? 'VERIFIED' : 'MISMATCH'} - ${senderVerification.notes}`)
          }
        }
      }
    }

    // If we still couldn't find owner, try to find from the domain
    if (!ownerId) {
      ownerId = await findOwnerFromDomain(supabaseClient, email.to)
      // Domain-based lookup cannot verify sender
      senderVerification = { verified: false, notes: 'Owner found via domain lookup - no original email to verify against' }
    }

    if (!ownerId) {
      console.error('Could not determine owner for inbound email')
      // Return 200 to prevent SendGrid retries - we can't process this
      return new Response(
        JSON.stringify({ success: false, error: 'Could not determine owner' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store the reply with sender verification status
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
        references_header: headers['references'] || email.references,
        attachments: email.attachmentsInfo || [],
        raw_headers: headers,
        received_at: new Date().toISOString(),
        // New verification fields
        sender_verified: senderVerification.verified,
        expected_sender_email: expectedSenderEmail,
        verification_notes: senderVerification.notes
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error storing reply:', insertError)
      throw insertError
    }

    console.log(`Stored reply ${reply?.id} for email_log ${emailLogId} (sender_verified: ${senderVerification.verified})`)

    // Note: The trigger will automatically update email_logs with reply stats

    // Log activity for the reply
    await supabaseClient
      .from('activity_log')
      .insert({
        owner_id: ownerId,
        event_type: 'email_reply_received',
        event_category: 'email',
        title: 'Email reply received',
        description: `Reply from ${email.from} to "${email.subject}"`,
        email_log_id: emailLogId,
        account_id: accountId,
        actor_type: 'contact',
        severity: 'info',
        metadata: {
          reply_id: reply?.id,
          from_email: email.from,
          from_name: email.fromName
        },
        created_at: new Date().toISOString()
      })

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
        receivedAt: new Date().toISOString(),
        // Pass the original recipient email so Reply-To is set correctly
        // This ensures when user hits "reply" in their inbox, it goes to the contact
        // expectedSenderEmail is the original to_email from email_logs (the contact's email)
        originalRecipientEmail: expectedSenderEmail || email.from
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

  // Get text and html - check both direct fields and parse from 'email' field if needed
  let text = formData.get('text') as string || undefined
  let html = formData.get('html') as string || undefined

  // If text/html not present, try to extract from raw 'email' field (MIME message)
  if (!text && !html) {
    const rawEmail = formData.get('email') as string
    if (rawEmail) {
      const extracted = extractBodyFromMime(rawEmail)
      text = extracted.text
      html = extracted.html
      console.log(`Extracted body from MIME: text=${text?.length || 0} chars, html=${html?.length || 0} chars`)
    }
  }

  return {
    to,
    from,
    fromName,
    subject: formData.get('subject') as string || '(no subject)',
    text,
    html,
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

/**
 * Extract text and html body from raw MIME email message
 * This is a simplified parser for common email formats
 */
function extractBodyFromMime(rawEmail: string): { text?: string; html?: string } {
  let text: string | undefined
  let html: string | undefined

  // Check if it's multipart
  const boundaryMatch = rawEmail.match(/boundary="?([^"\r\n]+)"?/i)

  if (boundaryMatch) {
    const boundary = boundaryMatch[1]
    const parts = rawEmail.split(`--${boundary}`)

    for (const part of parts) {
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      if (!contentTypeMatch) continue

      const contentType = contentTypeMatch[1].toLowerCase().trim()

      // Find the body (after double newline)
      const bodyMatch = part.match(/\r?\n\r?\n([\s\S]*)/)
      if (!bodyMatch) continue

      let body = bodyMatch[1].trim()

      // Check for transfer encoding
      const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
      const encoding = encodingMatch?.[1]?.toLowerCase().trim()

      // Decode if needed
      if (encoding === 'base64') {
        try {
          body = atob(body.replace(/\s/g, ''))
        } catch (e) {
          console.warn('Failed to decode base64 body')
        }
      } else if (encoding === 'quoted-printable') {
        body = decodeQuotedPrintable(body)
      }

      if (contentType.includes('text/plain') && !text) {
        text = body
      } else if (contentType.includes('text/html') && !html) {
        html = body
      }
    }
  } else {
    // Not multipart - check Content-Type header
    const contentTypeMatch = rawEmail.match(/Content-Type:\s*([^;\r\n]+)/i)
    const contentType = contentTypeMatch?.[1]?.toLowerCase().trim() || 'text/plain'

    // Find body after headers (double newline)
    const bodyMatch = rawEmail.match(/\r?\n\r?\n([\s\S]*)/)
    if (bodyMatch) {
      let body = bodyMatch[1].trim()

      // Check for transfer encoding
      const encodingMatch = rawEmail.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
      const encoding = encodingMatch?.[1]?.toLowerCase().trim()

      if (encoding === 'base64') {
        try {
          body = atob(body.replace(/\s/g, ''))
        } catch (e) {
          console.warn('Failed to decode base64 body')
        }
      } else if (encoding === 'quoted-printable') {
        body = decodeQuotedPrintable(body)
      }

      if (contentType.includes('text/html')) {
        html = body
      } else {
        text = body
      }
    }
  }

  return { text, html }
}

/**
 * Decode quoted-printable encoded text
 */
function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

interface VerificationResult {
  verified: boolean
  notes: string
}

function verifyReplyFrom(replyFrom: string, originalTo: string): VerificationResult {
  // Normalize emails for comparison (lowercase, trim)
  // Handle formats like "Name <email@domain.com>" by extracting the email
  const extractEmail = (str: string): string => {
    const match = str.match(/<([^>]+)>/)
    return (match ? match[1] : str).toLowerCase().trim()
  }

  const normalizedReply = extractEmail(replyFrom)
  const normalizedOriginal = extractEmail(originalTo)

  // Exact match - fully verified
  if (normalizedReply === normalizedOriginal) {
    return { verified: true, notes: 'Exact email match' }
  }

  // Domain match only - not verified but provide context
  const replyDomain = normalizedReply.split('@')[1]
  const originalDomain = normalizedOriginal.split('@')[1]

  if (replyDomain === originalDomain) {
    return {
      verified: false,
      notes: `Domain match only: expected ${normalizedOriginal}, got ${normalizedReply}`
    }
  }

  // No match at all
  return {
    verified: false,
    notes: `No match: expected ${normalizedOriginal}, got ${normalizedReply}`
  }
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
  // fromEmail is the email address that SendGrid received the reply FROM (could be any address)
  // For display and Reply-To, we should use originalRecipientEmail instead
  fromEmail: string
  fromName?: string
  subject: string
  bodyText?: string
  bodyHtml?: string
  receivedAt: string
  // The original recipient email (contact's actual email from email_logs.to_email)
  // This is the CORRECT email to display in "Reply from:" and use for Reply-To
  // When we sent the original email to contact@example.com, this should be contact@example.com
  originalRecipientEmail?: string
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

async function attemptInboxInjection(
  supabase: any,
  params: InjectionParams
): Promise<{ success: boolean; method?: string; error?: string }> {
  // Get user data including email for fallback forwarding
  const { data: userData, error: userLookupError } = await supabase
    .from('users')
    .select('profile_name, email')
    .eq('user_unique_id', params.ownerId)
    .single()

  const ownerEmail = userData?.email

  console.log('[Inbox Injection] User lookup for fallback:', {
    ownerId: params.ownerId,
    userFound: !!userData,
    ownerEmail: ownerEmail || '(not found)',
    profileName: userData?.profile_name,
    lookupError: userLookupError?.message
  })

  // Helper to attempt SendGrid fallback
  const attemptSendGridFallback = async (reason: string): Promise<{ success: boolean; method?: string; error?: string }> => {
    if (!ownerEmail) {
      console.log(`No owner email found for ${params.ownerId} - cannot use SendGrid fallback`)
      return { success: false, error: `${reason}; no_owner_email_for_fallback` }
    }

    console.log(`OAuth injection failed (${reason}), attempting SendGrid fallback to ${ownerEmail}`)
    const fallbackResult = await forwardViaSendGrid(supabase, params, ownerEmail)

    // Update injection status with fallback result
    await supabase
      .from('email_replies')
      .update({
        inbox_injected: fallbackResult.success,
        inbox_injected_at: fallbackResult.success ? new Date().toISOString() : null,
        inbox_injection_provider: 'sendgrid_fallback',
        inbox_injection_error: fallbackResult.error || null
      })
      .eq('id', params.replyId)

    return fallbackResult
  }

  try {
    // Check if user (owner) has an active OAuth connection
    // Connections are per-user (owner_id) so replies go to the correct person's inbox
    const { data: connection } = await supabase
      .from('email_provider_connections')
      .select('*')
      .eq('owner_id', params.ownerId)
      .eq('status', 'active')
      .single()

    if (!connection) {
      console.log(`No active OAuth connection for owner ${params.ownerId} - trying SendGrid fallback`)
      return await attemptSendGridFallback('no_oauth_connection')
    }

    // Decrypt access token
    let accessToken: string
    try {
      accessToken = await decryptToken(connection.access_token_encrypted)
    } catch (err) {
      console.error('Failed to decrypt token:', err)
      return await attemptSendGridFallback('token_decrypt_failed')
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
        return await attemptSendGridFallback('token_refresh_failed')
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

    // If OAuth injection failed, try SendGrid fallback
    if (!result.success) {
      console.log(`OAuth injection failed: ${result.error} - trying SendGrid fallback`)
      return await attemptSendGridFallback(result.error || 'oauth_injection_failed')
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
    return await attemptSendGridFallback(error.message)
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
// SENDGRID FALLBACK - Forward reply via SendGrid when OAuth fails
// ============================================================================

async function forwardViaSendGrid(
  supabase: any,
  params: InjectionParams,
  ownerEmail: string
): Promise<{ success: boolean; method?: string; error?: string }> {
  const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
  const fallbackFromEmail = Deno.env.get('SENDGRID_FORWARD_FROM') || 'replies@isg-replies.com'

  if (!sendgridApiKey) {
    console.error('SENDGRID_API_KEY not configured - cannot forward reply')
    return { success: false, error: 'sendgrid_not_configured' }
  }

  if (!ownerEmail) {
    console.error('[SendGrid Fallback] ownerEmail is empty/null - cannot forward')
    return { success: false, error: 'no_owner_email' }
  }

  // Look up the user's verified sender domain to use for the from address
  // This ensures emails come from a trusted domain (their own) rather than isg-replies.com
  // Match by the user's email domain (e.g., user@isgdfw.com -> isgdfw.com)
  let fromEmail = fallbackFromEmail
  const userEmailDomain = ownerEmail.split('@')[1]?.toLowerCase()

  if (userEmailDomain) {
    // Find a verified sender domain matching the user's email domain
    const { data: senderDomain } = await supabase
      .from('sender_domains')
      .select('domain')
      .eq('status', 'verified')
      .eq('domain', userEmailDomain)
      .limit(1)
      .single()

    if (senderDomain?.domain) {
      // Use replies@{their-verified-domain} as the sender
      fromEmail = `replies@${senderDomain.domain}`
      console.log(`[SendGrid Fallback] Using verified domain matching user's email: ${fromEmail}`)
    } else {
      console.log(`[SendGrid Fallback] No verified domain found for ${userEmailDomain}, using fallback: ${fallbackFromEmail}`)
    }
  } else {
    console.log(`[SendGrid Fallback] Could not extract domain from ownerEmail: ${ownerEmail}`)
  }

  console.log('[SendGrid Fallback] Starting forward:', {
    ownerId: params.ownerId,
    ownerEmail,
    fromEmail,
    subject: params.subject,
    replyFromEmail: params.fromEmail
  })

  try {
    // Build the forwarded email content
    // Use originalRecipientEmail (the contact's actual email) for display, fallback to fromEmail
    const contactEmail = params.originalRecipientEmail || params.fromEmail
    const fromName = params.fromName || contactEmail

    const forwardHeader = `
      <div style="padding: 10px; margin-bottom: 15px; border-left: 3px solid #4a90d9; background: #f5f8fa;">
        <strong>Reply from:</strong> ${fromName} &lt;${contactEmail}&gt;<br>
        <strong>Received:</strong> ${new Date(params.receivedAt).toLocaleString()}
      </div>
    `

    const htmlContent = params.bodyHtml
      ? `${forwardHeader}${params.bodyHtml}`
      : `${forwardHeader}<pre style="white-space: pre-wrap;">${params.bodyText || ''}</pre>`

    const textContent = params.bodyText
      ? `--- Reply from: ${fromName} <${contactEmail}> ---\nReceived: ${new Date(params.receivedAt).toLocaleString()}\n\n${params.bodyText}`
      : `--- Reply from: ${fromName} <${contactEmail}> ---\nReceived: ${new Date(params.receivedAt).toLocaleString()}\n\n${params.bodyHtml?.replace(/<[^>]*>/g, '') || ''}`

    // fromEmail is already set above from SENDGRID_FORWARD_FROM env var
    // The reply-to will be set to the contact's email so replies go to them

    const payload = {
      personalizations: [{
        to: [{ email: ownerEmail }]
      }],
      from: {
        email: fromEmail,
        name: `Reply from ${fromName}`
      },
      reply_to: {
        email: contactEmail,
        name: params.fromName || undefined
      },
      subject: params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`,
      content: [
        { type: 'text/plain', value: textContent },
        { type: 'text/html', value: htmlContent }
      ],
      categories: ['reply_forward', 'inbox_injection_fallback']
    }

    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get('X-Message-Id') || `sg-fwd-${Date.now()}`
      console.log(`SendGrid fallback forward successful: ${messageId} to ${ownerEmail}`)
      return { success: true, method: 'sendgrid_fallback' }
    } else {
      const errorText = await response.text()
      console.error(`SendGrid forward error: ${response.status} - ${errorText}`)
      return { success: false, method: 'sendgrid_fallback', error: `SendGrid error: ${response.status}` }
    }
  } catch (err: any) {
    console.error('SendGrid fallback error:', err)
    return { success: false, method: 'sendgrid_fallback', error: err.message }
  }
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
    // Use originalRecipientEmail (the contact's actual email) for From, fallback to fromEmail
    const contactEmail = params.originalRecipientEmail || params.fromEmail
    const fromHeader = params.fromName
      ? `"${params.fromName}" <${contactEmail}>`
      : contactEmail

    // Build email headers - include Reply-To so replies go back to the contact
    const emailLines = [
      `From: ${fromHeader}`,
      `To: me`,
      `Subject: ${params.subject}`,
      `Date: ${new Date(params.receivedAt).toUTCString()}`
    ]

    // Add Reply-To header pointing to the contact
    // This ensures when you hit "reply" in Gmail, it goes to the contact
    // For Gmail injection, From and Reply-To should both be the contact's email
    emailLines.push(`Reply-To: ${fromHeader}`)

    emailLines.push(
      `Content-Type: ${params.bodyHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
      '',
      params.bodyHtml || params.bodyText || ''
    )

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
// MICROSOFT INJECTION - Use Graph API to create message in inbox
// ============================================================================
//
// Note: Microsoft Graph API has limitations:
// - Cannot set 'from' to an external email (always uses mailbox owner)
// - Messages created via API appear as drafts (isDraft=true is ignored)
//
// Workaround: Add a clear header showing who the reply is from, and set
// replyTo so hitting "Reply" goes to the contact.

async function injectIntoMicrosoft(
  accessToken: string,
  params: InjectionParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Use originalRecipientEmail (the contact's actual email) for display, fallback to fromEmail
    const contactEmail = params.originalRecipientEmail || params.fromEmail
    const fromName = params.fromName || contactEmail

    // Add a header to the body showing who the reply is from
    // This is necessary because Graph API won't let us set 'from' to an external address
    const replyHeader = `<div style="padding: 12px 16px; margin-bottom: 16px; background: #f0f7ff; border-left: 4px solid #0078d4; border-radius: 4px;">
      <strong style="color: #0078d4;">Reply from:</strong> ${fromName} &lt;${contactEmail}&gt;<br>
      <span style="color: #666; font-size: 12px;">Received: ${new Date(params.receivedAt).toLocaleString()}</span>
    </div>`

    const bodyContent = params.bodyHtml
      ? `${replyHeader}${params.bodyHtml}`
      : `${replyHeader}<pre style="white-space: pre-wrap; font-family: inherit;">${params.bodyText || ''}</pre>`

    // Build message payload
    // Note: We cannot set 'from' to external address, so we rely on replyTo and the header
    const messagePayload = {
      subject: params.subject,
      body: {
        contentType: 'HTML',
        content: bodyContent
      },
      receivedDateTime: params.receivedAt,
      isRead: false,
      isDraft: false,
      // Set replyTo to the contact's email so "Reply" goes to them
      replyTo: [{
        emailAddress: {
          name: fromName,
          address: contactEmail
        }
      }]
    }

    // Create message directly in inbox folder
    const createResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error(`Microsoft Graph API error: ${createResponse.status} - ${errorText}`)
      return { success: false, error: `Microsoft Graph API error: ${createResponse.status}` }
    }

    const message = await createResponse.json()
    console.log(`Microsoft injection successful: ${message.id}, isDraft: ${message.isDraft}`)
    return { success: true, messageId: message.id }
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
