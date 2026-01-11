// supabase/functions/sendgrid-inbound-parse/index.ts
// Webhook handler for SendGrid Inbound Parse
// Receives email replies and links them to original sent emails
// Reply-To format: reply+{email_log_id}@parse.{domain}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Look up the original email using In-Reply-To header
    // Our custom Message-ID format: <isg-{email_log_id}-{timestamp}@{domain}>
    let emailLogId: number | null = null
    let ownerId: string | null = null
    let accountId: string | null = null

    if (inReplyTo) {
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
