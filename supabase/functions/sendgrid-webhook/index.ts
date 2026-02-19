// supabase/functions/sendgrid-webhook/index.ts
// Webhook handler for SendGrid email events
// Receives: delivered, opened, clicked, bounced, dropped, unsubscribed events
// Updates email_logs table with tracking data

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-email-event-webhook-signature, x-twilio-email-event-webhook-timestamp',
}

// SendGrid webhook signature verification
// See: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
async function verifySignature(
  publicKeyBase64: string,
  payload: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  try {
    // Decode the base64 public key (SendGrid provides it in base64 PEM format)
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`

    // Import the public key for ECDSA verification
    const publicKey = await crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(publicKeyPem),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )

    // SendGrid signature verification: hash(timestamp + payload)
    const encoder = new TextEncoder()
    const dataToVerify = encoder.encode(timestamp + payload)

    // Decode the signature from base64
    const signatureBytes = base64Decode(signature)

    // Convert from ASN.1/DER format to raw r||s format for Web Crypto API
    const rawSignature = derToRaw(signatureBytes)

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      rawSignature,
      dataToVerify
    )

    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

// Convert PEM to ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buffer
}

// Convert ASN.1/DER encoded ECDSA signature to raw r||s format
// SendGrid uses ASN.1 DER encoding, but Web Crypto API expects raw format
function derToRaw(derSignature: Uint8Array): ArrayBuffer {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  // We need to extract r and s, pad them to 32 bytes each, and concatenate

  let offset = 0

  // Check for SEQUENCE tag (0x30)
  if (derSignature[offset++] !== 0x30) {
    throw new Error('Invalid DER signature: missing SEQUENCE tag')
  }

  // Skip total length (could be 1 or 2 bytes)
  const totalLength = derSignature[offset++]
  if (totalLength & 0x80) {
    // Long form length - skip additional length bytes
    offset += (totalLength & 0x7f)
  }

  // Parse r
  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for r')
  }
  const rLength = derSignature[offset++]
  let rStart = offset
  // Skip leading zero if present (used for positive number encoding)
  if (derSignature[rStart] === 0x00 && rLength > 32) {
    rStart++
  }
  const r = derSignature.slice(rStart, offset + rLength)
  offset += rLength

  // Parse s
  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for s')
  }
  const sLength = derSignature[offset++]
  let sStart = offset
  // Skip leading zero if present
  if (derSignature[sStart] === 0x00 && sLength > 32) {
    sStart++
  }
  const s = derSignature.slice(sStart, offset + sLength)

  // Create raw signature (r || s), each padded to 32 bytes for P-256
  const rawSignature = new Uint8Array(64)
  rawSignature.set(r, 32 - r.length)  // Right-align r
  rawSignature.set(s, 64 - s.length)  // Right-align s

  return rawSignature.buffer
}

// SendGrid event types we handle
type SendGridEventType =
  | 'processed'
  | 'delivered'
  | 'open'
  | 'click'
  | 'bounce'
  | 'dropped'
  | 'spamreport'
  | 'unsubscribe'
  | 'group_unsubscribe'
  | 'group_resubscribe'
  | 'deferred'

interface SendGridEvent {
  email: string
  timestamp: number
  event: SendGridEventType
  sg_message_id: string
  sg_event_id: string
  useragent?: string
  ip?: string
  url?: string
  reason?: string
  status?: string
  type?: string // bounce type
  category?: string[]
  // Custom args we passed when sending
  scheduled_email_id?: string
  automation_id?: string
  account_id?: string
  owner_id?: string
}

serve(async (req) => {
  // Log webhook call (without headers to avoid leaking auth tokens)
  console.log('=== SendGrid Webhook Called ===', {
    method: req.method,
    url: req.url
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
    // Get the raw body for signature verification (must be done before parsing JSON)
    const rawBody = await req.text()
    console.log('Raw webhook body length:', rawBody.length, 'chars')

    // Verify SendGrid webhook signature (REQUIRED - reject if not configured)
    const sendgridPublicKey = Deno.env.get('SENDGRID_WEBHOOK_PUBLIC_KEY')
    if (!sendgridPublicKey) {
      console.error('SENDGRID_WEBHOOK_PUBLIC_KEY not configured - rejecting request for security')
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const signature = req.headers.get('X-Twilio-Email-Event-Webhook-Signature')
    const timestamp = req.headers.get('X-Twilio-Email-Event-Webhook-Timestamp')

    if (!signature || !timestamp) {
      console.error('Missing signature headers')
      return new Response(
        JSON.stringify({ error: 'Missing signature headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const isValid = await verifySignature(sendgridPublicKey, rawBody, signature, timestamp)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Webhook signature verified successfully')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse the webhook payload (array of events)
    const events: SendGridEvent[] = JSON.parse(rawBody)

    if (!Array.isArray(events)) {
      return new Response(
        JSON.stringify({ error: 'Expected array of events' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = {
      processed: 0,
      updated: 0,
      errors: [] as string[]
    }

    // Log all incoming events for debugging
    console.log(`Received ${events.length} SendGrid events:`, events.map(e => ({
      event: e.event,
      sg_message_id: e.sg_message_id,
      email: e.email
    })))

    for (const event of events) {
      try {
        await processEvent(supabaseClient, event)
        results.processed++
        results.updated++
      } catch (err: any) {
        console.error(`Error processing event ${event.sg_event_id}:`, err)
        results.errors.push(`Error processing event ${event.sg_event_id}: ${err.message}`)
      }
    }

    // Log webhook receipt for debugging
    console.log(`Processed ${results.processed} SendGrid events, updated ${results.updated}, ${results.errors.length} errors`)

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function processEvent(supabase: any, event: SendGridEvent): Promise<void> {
  // Clean up the SendGrid message ID (remove the filter ID suffix)
  const messageId = event.sg_message_id?.split('.')[0]

  if (!messageId) {
    console.warn('Event missing sg_message_id:', event)
    return
  }

  const eventTime = new Date(event.timestamp * 1000).toISOString()

  // Find the email log by SendGrid message ID
  let emailLog: any = null

  const { data: emailLogExact, error: findError } = await supabase
    .from('email_logs')
    .select('id, status, open_count, click_count')
    .eq('sendgrid_message_id', messageId)
    .single()

  if (findError || !emailLogExact) {
    // Try finding by the full message ID (with filter suffix)
    const { data: emailLogAlt } = await supabase
      .from('email_logs')
      .select('id, status, open_count, click_count')
      .ilike('sendgrid_message_id', `${messageId}%`)
      .limit(1)
      .single()

    if (!emailLogAlt) {
      console.warn(`Email log not found for message ID: ${messageId}`)
      return
    }
    emailLog = emailLogAlt
  } else {
    emailLog = emailLogExact
  }

  const logId = emailLog.id

  // Process based on event type
  switch (event.event) {
    case 'delivered':
      await supabase
        .from('email_logs')
        .update({
          status: 'Delivered',
          delivered_at: eventTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)
      break

    case 'open':
      const currentOpenCount = emailLog?.open_count || 0
      const updates: any = {
        status: emailLog?.status === 'Delivered' || emailLog?.status === 'Sent' ? 'Opened' : emailLog?.status,
        open_count: currentOpenCount + 1,
        updated_at: new Date().toISOString()
      }
      // Only set first_opened_at if not already set
      if (currentOpenCount === 0) {
        updates.first_opened_at = eventTime
      }
      await supabase
        .from('email_logs')
        .update(updates)
        .eq('id', logId)
      break

    case 'click':
      const currentClickCount = emailLog?.click_count || 0
      const clickUpdates: any = {
        status: 'Clicked',
        click_count: currentClickCount + 1,
        updated_at: new Date().toISOString()
      }
      // Only set first_clicked_at if not already set
      if (currentClickCount === 0) {
        clickUpdates.first_clicked_at = eventTime
      }
      await supabase
        .from('email_logs')
        .update(clickUpdates)
        .eq('id', logId)

      // Log the click event for analytics
      if (event.url) {
        await supabase
          .from('email_events')
          .insert({
            email_log_id: logId,
            event_type: 'click',
            raw_payload: { url: event.url, ip: event.ip, useragent: event.useragent },
            event_timestamp: eventTime
          })
      }
      break

    case 'bounce':
      await supabase
        .from('email_logs')
        .update({
          status: 'Bounced',
          bounced_at: eventTime,
          bounce_type: event.type || 'unknown',
          error_message: event.reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)

      // Add to suppression list for hard bounces
      if (event.type === 'bounce' && event.email) {
        await addToSuppressionList(supabase, event.email, 'bounce', event.reason)
      }
      break

    case 'dropped':
      await supabase
        .from('email_logs')
        .update({
          status: 'Dropped',
          error_message: event.reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)
      break

    case 'spamreport':
      await supabase
        .from('email_logs')
        .update({
          status: 'SpamReport',
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)

      // Add to suppression list
      if (event.email) {
        await addToSuppressionList(supabase, event.email, 'spam_report')
      }
      break

    case 'unsubscribe':
    case 'group_unsubscribe':
      await supabase
        .from('email_logs')
        .update({
          status: 'Unsubscribed',
          unsubscribed_at: eventTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)

      // Add to unsubscribe list
      if (event.email) {
        await addToUnsubscribeList(supabase, event.email, event.owner_id)
      }
      break

    case 'deferred':
      // Log deferred but don't change status (will retry)
      console.log(`Email deferred: ${messageId}, reason: ${event.reason}`)
      break

    default:
      console.log(`Unhandled event type: ${event.event}`)
  }
}

async function addToSuppressionList(
  supabase: any,
  email: string,
  reason: string,
  details?: string
): Promise<void> {
  // Check if already suppressed
  const { data: existing } = await supabase
    .from('email_suppressions')
    .select('id')
    .ilike('email', email.trim())
    .limit(1)

  if (existing && existing.length > 0) {
    return // Already suppressed
  }

  await supabase
    .from('email_suppressions')
    .insert({
      email: email.trim().toLowerCase(),
      reason,
      details,
      created_at: new Date().toISOString()
    })
}

async function addToUnsubscribeList(
  supabase: any,
  email: string,
  ownerId?: string
): Promise<void> {
  // Check if already unsubscribed
  const { data: existing } = await supabase
    .from('unsubscribes')
    .select('id')
    .ilike('email', email.trim())
    .limit(1)

  if (existing && existing.length > 0) {
    return // Already unsubscribed
  }

  await supabase
    .from('unsubscribes')
    .insert({
      email: email.trim().toLowerCase(),
      owner_id: ownerId,
      source: 'sendgrid_webhook',
      created_at: new Date().toISOString()
    })

  // Also update the account if we can find it
  await supabase
    .from('accounts')
    .update({ person_has_opted_out_of_email: true })
    .ilike('person_email', email.trim())
}
