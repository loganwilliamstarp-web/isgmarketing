// supabase/functions/send-direct-email/index.ts
// Edge function to send a direct email immediately (not from automation)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
    if (!sendgridApiKey) {
      console.warn('SENDGRID_API_KEY not configured')
    }

    const body = await req.json()
    const { scheduledEmailId, bodyHtml, bodyText, fromEmail, fromName } = body

    if (!scheduledEmailId) {
      return new Response(
        JSON.stringify({ error: 'Missing scheduledEmailId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the scheduled email with account info
    const { data: email, error: fetchError } = await supabaseClient
      .from('scheduled_emails')
      .select(`
        *,
        account:accounts(*)
      `)
      .eq('id', scheduledEmailId)
      .single()

    if (fetchError || !email) {
      return new Response(
        JSON.stringify({ error: 'Scheduled email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check email validation status - perform JIT validation if needed
    const account = email.account || {}
    const recipientEmail = email.to_email
    const currentStatus = account.email_validation_status || 'unknown'

    // Check if validation is expired (> 90 days old) or never done
    const validatedAt = account.email_validated_at ? new Date(account.email_validated_at) : null
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const isExpired = !validatedAt || validatedAt < ninetyDaysAgo
    const needsJITValidation = currentStatus === 'unknown' || currentStatus === null || isExpired

    if (currentStatus !== 'valid') {
      if (needsJITValidation && recipientEmail) {
        console.log(`[JIT Validation] Attempting validation for ${recipientEmail} (status: ${currentStatus}, expired: ${isExpired})`)

        const jitResult = await performJITValidation(supabaseClient, email.account_id, recipientEmail)

        if (jitResult.status !== 'valid') {
          // Update scheduled email as cancelled
          await supabaseClient
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: `JIT validation failed: ${jitResult.status}${jitResult.reason ? ` (${jitResult.reason})` : ''}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', scheduledEmailId)

          return new Response(
            JSON.stringify({ success: false, error: `Email validation failed: ${jitResult.status}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        console.log(`[JIT Validation] ${recipientEmail} validated successfully - proceeding with send`)
      } else {
        // Not eligible for JIT validation and not valid - reject
        return new Response(
          JSON.stringify({ success: false, error: `Email validation status is '${currentStatus}' - cannot send` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Mark as processing
    await supabaseClient
      .from('scheduled_emails')
      .update({ status: 'Processing', updated_at: new Date().toISOString() })
      .eq('id', scheduledEmailId)

    // Get user settings for signature and google review link
    const { data: userSettings } = await supabaseClient
      .from('user_settings')
      .select('signature_html, agency_name, agency_address, agency_phone, agency_website, google_review_link')
      .eq('user_id', email.owner_id)
      .single()

    // Get account data for merge field processing (already declared above for validation)
    const recipientName = email.to_name

    // Use from email/name from scheduled email record (or body as fallback)
    const senderEmail = email.from_email || fromEmail
    const senderName = email.from_name || fromName

    // Create email log first (so we have ID for star rating URLs and unsubscribe links)
    const { data: emailLog, error: logError } = await supabaseClient
      .from('email_logs')
      .insert({
        owner_id: email.owner_id,
        account_id: email.account_id,
        to_email: recipientEmail,
        to_name: recipientName,
        from_email: senderEmail,
        from_name: senderName,
        subject: email.subject || '',
        body_html: bodyHtml || '',
        body_text: bodyText || '',
        status: 'Queued',
        queued_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (logError || !emailLog) {
      throw new Error(`Failed to create email log: ${logError?.message}`)
    }

    // Build email footer with email_log.id for unsubscribe tracking
    const emailFooter = buildEmailFooter(userSettings, email, emailLog.id)

    // Now apply merge fields with the email log ID (for star rating URLs)
    const processedSubject = applyMergeFields(email.subject || '', email, account, emailLog.id)
    const processedBodyHtml = applyMergeFields(bodyHtml || '', email, account, emailLog.id)
    const processedBodyText = applyMergeFields(bodyText || bodyHtml?.replace(/<[^>]*>/g, '') || '', email, account, emailLog.id)

    // Wrap body in proper HTML document with UTF-8 charset for proper character encoding
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0;">
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
    <style>p { margin: 0 0 1em 0; } p:last-of-type { margin-bottom: 0; }</style>
    ${processedBodyHtml}
    ${emailFooter}
  </div>
</body>
</html>`.trim()

    // Update email log with processed content
    await supabaseClient
      .from('email_logs')
      .update({
        subject: processedSubject,
        body_html: htmlContent,
        body_text: processedBodyText
      })
      .eq('id', emailLog.id)

    // Build Message-ID for reply tracking
    const domainPart = senderEmail?.split('@')[1] || 'isgmarketing.com'
    const customMessageId = `<isg-${emailLog.id}-${Date.now()}@${domainPart}>`

    // Check if sender has OAuth connected for inbox injection
    // If yes, use tracking reply address (mailbox-replies.com)
    // If no, use sender's actual email (normal flow, no tracking)
    let replyToAddress = senderEmail
    let useTrackingReply = false
    const replyDomain = Deno.env.get('REPLY_DOMAIN')

    if (replyDomain) {
      // OAuth connections are stored at agency level (profile_name)
      // First get the user's profile_name from the users table
      const { data: userData } = await supabaseClient
        .from('users')
        .select('profile_name')
        .eq('user_unique_id', email.owner_id)
        .single()

      const agencyId = userData?.profile_name

      if (agencyId) {
        const { data: oauthConn } = await supabaseClient
          .from('email_provider_connections')
          .select('id')
          .eq('agency_id', agencyId)
          .eq('status', 'active')
          .limit(1)

        if (oauthConn && oauthConn.length > 0) {
          // OAuth connected: use tracking reply address for inbox injection
          replyToAddress = `reply-${emailLog.id}@${replyDomain}`
          useTrackingReply = true
          console.log(`Using tracking reply address: ${replyToAddress} (agency: ${agencyId})`)
        }
      }
    }

    // Dry run if no API key
    if (!sendgridApiKey) {
      console.log(`[DRY RUN] Would send direct email to ${recipientEmail}`)

      await supabaseClient
        .from('email_logs')
        .update({
          status: 'Sent',
          sent_at: new Date().toISOString(),
          sendgrid_message_id: `dry-run-${Date.now()}`,
          custom_message_id: customMessageId,
          reply_to: replyToAddress,
          use_tracking_reply: useTrackingReply
        })
        .eq('id', emailLog.id)

      await supabaseClient
        .from('scheduled_emails')
        .update({ status: 'Sent', email_log_id: emailLog.id, updated_at: new Date().toISOString() })
        .eq('id', scheduledEmailId)

      return new Response(
        JSON.stringify({ success: true, messageId: `dry-run-${Date.now()}`, dryRun: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build SendGrid payload
    const payload = {
      personalizations: [{
        to: [{
          email: recipientEmail,
          name: recipientName || undefined
        }],
        custom_args: {
          email_log_id: emailLog.id.toString(),
          owner_id: email.owner_id,
          account_id: email.account_id || ''
        }
      }],
      from: {
        email: senderEmail,
        name: senderName || ''
      },
      reply_to: {
        email: replyToAddress,
        name: senderName || ''
      },
      subject: processedSubject,
      content: [
        { type: 'text/plain', value: processedBodyText },
        { type: 'text/html', value: htmlContent }
      ],
      headers: {
        'Message-ID': customMessageId
      },
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking: { enable: true },
        subscription_tracking: { enable: false }
      },
      categories: ['direct_email', `owner_${email.owner_id}`]
    }

    // Send via SendGrid
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get('X-Message-Id') || `sg-${Date.now()}`

      // Update email log as sent
      await supabaseClient
        .from('email_logs')
        .update({
          status: 'Sent',
          sent_at: new Date().toISOString(),
          sendgrid_message_id: messageId,
          custom_message_id: customMessageId,
          reply_to: replyToAddress,
          use_tracking_reply: useTrackingReply
        })
        .eq('id', emailLog.id)

      // Update scheduled email as sent
      await supabaseClient
        .from('scheduled_emails')
        .update({ status: 'Sent', email_log_id: emailLog.id, updated_at: new Date().toISOString() })
        .eq('id', scheduledEmailId)

      // Log activity
      await supabaseClient
        .from('activity_log')
        .insert({
          owner_id: email.owner_id,
          event_type: 'email_sent',
          event_category: 'email',
          title: 'Direct email sent',
          description: `Email "${email.subject}" sent to ${recipientEmail}`,
          email_log_id: emailLog.id,
          account_id: email.account_id,
          actor_type: 'user',
          severity: 'info',
          created_at: new Date().toISOString()
        })

      return new Response(
        JSON.stringify({ success: true, messageId, emailLogId: emailLog.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      const errorBody = await response.text()
      let errorMessage = `SendGrid error: ${response.status}`
      try {
        const errorJson = JSON.parse(errorBody)
        errorMessage = errorJson.errors?.map((e: any) => e.message).join(', ') || errorMessage
      } catch {
        errorMessage = `${errorMessage} - ${errorBody.substring(0, 200)}`
      }

      // Update as failed
      await supabaseClient
        .from('email_logs')
        .update({ status: 'Failed', failed_at: new Date().toISOString(), error_message: errorMessage })
        .eq('id', emailLog.id)

      await supabaseClient
        .from('scheduled_emails')
        .update({ status: 'Failed', error_message: errorMessage, updated_at: new Date().toISOString() })
        .eq('id', scheduledEmailId)

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function applyMergeFields(content: string, email: any, account: any, emailLogId?: number | null): string {
  if (!content) return content

  // Extract first/last name from account.name if dedicated fields aren't available
  const nameParts = (account?.name || '').trim().split(/\s+/)
  const derivedFirstName = nameParts[0] || ''
  const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

  // Build star rating URLs if we have an email log ID
  const starRatingBaseUrl = Deno.env.get('SUPABASE_URL')
    ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/star-rating`
    : 'https://app.isgmarketing.com/api/star-rating'

  const buildRatingUrl = (stars: number) => {
    if (!emailLogId) return '#'
    const params = new URLSearchParams({
      id: emailLogId.toString(),
      rating: stars.toString(),
      account: email.account_id || ''
    })
    return `${starRatingBaseUrl}?${params.toString()}`
  }

  const mergeFields: Record<string, string> = {
    // Account fields
    '{{first_name}}': account?.primary_contact_first_name || derivedFirstName,
    '{{last_name}}': account?.primary_contact_last_name || derivedLastName,
    '{{full_name}}': [account?.primary_contact_first_name, account?.primary_contact_last_name].filter(Boolean).join(' ') || account?.name || '',
    '{{name}}': account?.name || '',
    '{{company_name}}': account?.name || '',
    '{{email}}': account?.person_email || account?.email || email.to_email || '',
    '{{phone}}': account?.phone || '',

    // Address fields
    '{{address}}': account?.billing_street || '',
    '{{city}}': account?.billing_city || '',
    '{{state}}': account?.billing_state || '',
    '{{zip}}': account?.billing_postal_code || '',
    '{{postal_code}}': account?.billing_postal_code || '',

    // Recipient fields
    '{{recipient_name}}': email.to_name || '',
    '{{recipient_email}}': email.to_email || '',

    // Date fields
    '{{today}}': new Date().toLocaleDateString('en-US'),
    '{{current_year}}': new Date().getFullYear().toString(),

    // Star rating URLs (for periodic review emails)
    '{{rating_url_1}}': buildRatingUrl(1),
    '{{rating_url_2}}': buildRatingUrl(2),
    '{{rating_url_3}}': buildRatingUrl(3),
    '{{rating_url_4}}': buildRatingUrl(4),
    '{{rating_url_5}}': buildRatingUrl(5),
  }

  let result = content
  for (const [field, value] of Object.entries(mergeFields)) {
    // Case-insensitive replacement - also handle spaces inside braces like {{ field }}
    const fieldName = field.replace(/^\{\{|\}\}$/g, '') // Extract field name
    const pattern = `\\{\\{\\s*${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`
    result = result.replace(new RegExp(pattern, 'gi'), value)
  }

  return result
}

function buildEmailFooter(userSettings: any, email: any, emailLogId: number): string {
  const unsubscribeBaseUrl = Deno.env.get('UNSUBSCRIBE_URL') || 'https://app.isgmarketing.com/unsubscribe'
  // Use emailLogId for unsubscribe tracking (matches email_logs table)
  const unsubscribeUrl = `${unsubscribeBaseUrl}?id=${emailLogId}&email=${encodeURIComponent(email.to_email)}`

  let footer = ''

  // User signature
  if (userSettings?.signature_html) {
    footer += `
      <div style="margin-top: 20px; font-family: Arial, sans-serif;">
        <style>.email-sig p { margin: 0; }</style>
        <div class="email-sig">${userSettings.signature_html}</div>
      </div>
    `
  }

  // Company info
  const companyParts: string[] = []
  if (userSettings?.agency_name) companyParts.push(userSettings.agency_name)
  if (userSettings?.agency_address) companyParts.push(userSettings.agency_address)
  if (userSettings?.agency_phone) companyParts.push(userSettings.agency_phone)
  if (userSettings?.agency_website) companyParts.push(userSettings.agency_website)

  if (companyParts.length > 0) {
    footer += `
      <div style="margin-top: 20px; font-family: Arial, sans-serif; font-size: 12px; color: #888888; text-align: center;">
        ${companyParts.join(' | ')}
      </div>
    `
  }

  // Unsubscribe link
  footer += `
    <div style="margin-top: 15px; font-family: Arial, sans-serif; font-size: 11px; text-align: center;">
      <a href="${unsubscribeUrl}" style="color: #888888; text-decoration: underline;">Unsubscribe from these emails</a>
    </div>
  `

  return footer
}

// ============================================================================
// JUST-IN-TIME EMAIL VALIDATION
// ============================================================================

const SENDGRID_VALIDATION_URL = 'https://api.sendgrid.com/v3/validations/email'

/**
 * Perform just-in-time email validation before sending
 * Validates the email via SendGrid API and updates the account record
 */
async function performJITValidation(
  supabase: any,
  accountId: string,
  email: string
): Promise<{ status: 'valid' | 'risky' | 'invalid', reason: string | null }> {
  const sendgridValidationKey = Deno.env.get('SENDGRID_VALIDATION_KEY') || Deno.env.get('SENDGRID_API_KEY')

  if (!sendgridValidationKey) {
    console.warn('[JIT Validation] No SendGrid validation key configured - using fallback validation')
    const fallbackResult = fallbackValidation(email)
    await updateAccountValidation(supabase, accountId, fallbackResult)
    return { status: fallbackResult.status, reason: fallbackResult.reason }
  }

  if (!email || !email.includes('@') || !email.includes('.')) {
    const result = { status: 'invalid' as const, score: 0, reason: 'invalid_format', details: { local_check: true } }
    await updateAccountValidation(supabase, accountId, result)
    return { status: 'invalid', reason: 'invalid_format' }
  }

  try {
    const response = await fetch(SENDGRID_VALIDATION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridValidationKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, source: 'isg_marketing_jit_validation' })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[JIT Validation] SendGrid API error ${response.status}: ${errorText}`)

      if (response.status === 403 || response.status === 401 || errorText.includes('not enabled')) {
        const fallbackResult = fallbackValidation(email)
        await updateAccountValidation(supabase, accountId, fallbackResult)
        return { status: fallbackResult.status, reason: fallbackResult.reason }
      }
      throw new Error(`SendGrid API error: ${response.status}`)
    }

    const data = await response.json()
    const result = data.result

    let status: 'valid' | 'risky' | 'invalid'
    switch (result.verdict) {
      case 'Valid': status = 'valid'; break
      case 'Risky': status = 'risky'; break
      default: status = 'invalid'
    }

    let reason: string | null = null
    if (status !== 'valid') {
      const reasons: string[] = []
      if (result.checks?.domain?.is_suspected_disposable_address) reasons.push('disposable')
      if (result.checks?.local_part?.is_suspected_role_address) reasons.push('role_address')
      if (!result.checks?.domain?.has_mx_or_a_record) reasons.push('invalid_domain')
      if (!result.checks?.domain?.has_valid_address_syntax) reasons.push('invalid_syntax')
      if (result.checks?.additional?.has_known_bounces) reasons.push('known_bounces')
      reason = reasons.join(', ') || 'unknown'
    }

    const validationResult = { status, score: result.score, reason, details: result }
    await updateAccountValidation(supabase, accountId, validationResult)
    return { status, reason }

  } catch (err: any) {
    console.error(`[JIT Validation] Error validating ${email}:`, err.message)
    const fallbackResult = fallbackValidation(email)
    await updateAccountValidation(supabase, accountId, fallbackResult)
    return { status: fallbackResult.status, reason: fallbackResult.reason }
  }
}

async function updateAccountValidation(
  supabase: any,
  accountId: string,
  result: { status: string, score: number, reason: string | null, details?: Record<string, any> }
): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .update({
      email_validation_status: result.status,
      email_validation_score: result.score,
      email_validated_at: new Date().toISOString(),
      email_validation_reason: result.reason,
      email_validation_details: result.details || {}
    })
    .eq('account_unique_id', accountId)

  if (error) {
    console.error(`[JIT Validation] Failed to update account ${accountId}:`, error.message)
  }
}

function fallbackValidation(email: string): { status: 'valid' | 'risky' | 'invalid', score: number, reason: string | null, details: Record<string, any> } {
  const details: Record<string, any> = { fallback: true, jit: true }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { status: 'invalid', score: 0, reason: 'invalid_format', details: { ...details, check: 'format' } }
  }

  const domain = email.split('@')[1].toLowerCase()
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
    'yopmail.com', 'getnada.com', 'maildrop.cc', 'discard.email'
  ]

  if (disposableDomains.includes(domain)) {
    return { status: 'invalid', score: 0.1, reason: 'disposable', details: { ...details, check: 'disposable_domain' } }
  }

  const localPart = email.split('@')[0].toLowerCase()
  const roleAddresses = ['admin', 'info', 'support', 'sales', 'contact', 'help', 'noreply', 'no-reply']

  if (roleAddresses.includes(localPart)) {
    return { status: 'risky', score: 0.5, reason: 'role_address', details: { ...details, check: 'role_address' } }
  }

  if (/^(test|fake|sample|example)@/i.test(email) || /@(test|fake|sample|example)\./i.test(email)) {
    return { status: 'invalid', score: 0.1, reason: 'test_address', details: { ...details, check: 'fake_pattern' } }
  }

  return { status: 'valid', score: 0.7, reason: null, details: { ...details, check: 'passed_basic' } }
}
