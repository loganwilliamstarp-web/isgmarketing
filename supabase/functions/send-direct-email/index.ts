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

    // Mark as processing
    await supabaseClient
      .from('scheduled_emails')
      .update({ status: 'Processing', updated_at: new Date().toISOString() })
      .eq('id', scheduledEmailId)

    // Get user settings for signature
    const { data: userSettings } = await supabaseClient
      .from('user_settings')
      .select('signature_html, agency_name, agency_address, agency_phone, agency_website')
      .eq('user_id', email.owner_id)
      .single()

    // Build email footer
    const emailFooter = buildEmailFooter(userSettings, email)

    // Wrap body in proper HTML with footer
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
        <style>p { margin: 0 0 1em 0; } p:last-of-type { margin-bottom: 0; }</style>
        ${bodyHtml || ''}
        ${emailFooter}
      </div>
    `.trim()

    const recipientEmail = email.to_email
    const recipientName = email.to_name

    // Use from email/name from scheduled email record (or body as fallback)
    const senderEmail = email.from_email || fromEmail
    const senderName = email.from_name || fromName

    // Create email log
    const { data: emailLog, error: logError } = await supabaseClient
      .from('email_logs')
      .insert({
        owner_id: email.owner_id,
        account_id: email.account_id,
        to_email: recipientEmail,
        to_name: recipientName,
        from_email: senderEmail,
        from_name: senderName,
        subject: email.subject,
        body_html: htmlContent,
        body_text: bodyText || bodyHtml?.replace(/<[^>]*>/g, '') || '',
        status: 'Queued',
        queued_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (logError || !emailLog) {
      throw new Error(`Failed to create email log: ${logError?.message}`)
    }

    // Build Message-ID for reply tracking
    const domainPart = senderEmail?.split('@')[1] || 'isgmarketing.com'
    const customMessageId = `<isg-${emailLog.id}-${Date.now()}@${domainPart}>`

    // Check if sender has OAuth connected for inbox injection
    // If yes, use tracking reply address (mailbox-replies.com)
    // If no, use sender's actual email (normal flow, no tracking)
    let replyToAddress = senderEmail
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
          custom_message_id: customMessageId
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
      subject: email.subject,
      content: [
        { type: 'text/plain', value: bodyText || bodyHtml?.replace(/<[^>]*>/g, '') || '' },
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
          reply_to: replyToAddress
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

function buildEmailFooter(userSettings: any, email: any): string {
  const unsubscribeBaseUrl = Deno.env.get('UNSUBSCRIBE_URL') || 'https://app.isgmarketing.com/unsubscribe'
  const unsubscribeUrl = `${unsubscribeBaseUrl}?id=${email.id}&email=${encodeURIComponent(email.to_email)}`

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
