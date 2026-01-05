// supabase/functions/sendgrid-webhook/index.ts
// Webhook handler for SendGrid email events
// Receives: delivered, opened, clicked, bounced, dropped, unsubscribed events
// Updates email_logs table with tracking data

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Parse the webhook payload (array of events)
    const events: SendGridEvent[] = await req.json()

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

    for (const event of events) {
      try {
        await processEvent(supabaseClient, event)
        results.processed++
      } catch (err: any) {
        results.errors.push(`Error processing event ${event.sg_event_id}: ${err.message}`)
      }
    }

    // Log webhook receipt for debugging
    console.log(`Processed ${results.processed} SendGrid events, ${results.errors.length} errors`)

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
  const { data: emailLog, error: findError } = await supabase
    .from('email_logs')
    .select('id, status, open_count, click_count')
    .eq('sendgrid_message_id', messageId)
    .single()

  if (findError || !emailLog) {
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
  }

  const logId = emailLog?.id

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
            event_data: { url: event.url, ip: event.ip, useragent: event.useragent },
            created_at: eventTime
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
