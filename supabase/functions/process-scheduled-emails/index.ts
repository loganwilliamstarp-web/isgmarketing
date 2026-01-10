// supabase/functions/process-scheduled-emails/index.ts
// Edge function to process scheduled emails with SendGrid integration
// Handles: daily refresh, 24-hour verification, email sending
// Should be invoked via cron job or webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// SendGrid API endpoint
const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

// Rate limiting: max emails per batch to avoid timeouts
const MAX_EMAILS_PER_RUN = 50
const BATCH_SIZE = 100

interface ScheduledEmail {
  id: string
  owner_id: string
  automation_id: string | null
  batch_id: string | null
  account_id: string
  template_id: string
  recipient_email: string
  recipient_name: string
  from_email: string
  from_name: string
  subject: string
  scheduled_for: string
  status: string
  requires_verification: boolean
  qualification_value: string | null
  trigger_field: string | null
  account?: Record<string, any>
  template?: Record<string, any>
  automation?: Record<string, any>
}

serve(async (req) => {
  // Handle CORS preflight - must return 200 with proper headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
    if (!sendgridApiKey) {
      console.warn('SENDGRID_API_KEY not configured - running in dry-run mode')
    }

    // Parse request to determine action
    let action = 'process' // default action
    let automationId: string | null = null
    try {
      const body = await req.json()
      action = body.action || 'process'
      automationId = body.automationId || null
    } catch {
      // No body or invalid JSON, use default action
    }

    const results = {
      action,
      automationId,
      verified: 0,
      cancelled: 0,
      sent: 0,
      failed: 0,
      refreshed: 0,
      newScheduled: 0,
      errors: [] as string[]
    }

    // Step 0: Daily refresh - find new qualifying accounts for active automations
    // If automationId is provided, only refresh that specific automation
    if (action === 'refresh' || action === 'daily' || action === 'activate') {
      const refreshResult = await runDailyRefresh(supabaseClient, automationId)
      results.refreshed = refreshResult.automationsProcessed
      results.newScheduled = refreshResult.totalAdded
      results.cancelled += refreshResult.totalRemoved
      results.errors.push(...refreshResult.errors)
    }

    // Step 1: Run 24-hour verification for automation emails
    if (action === 'process' || action === 'verify' || action === 'daily') {
      const verifyResult = await runVerification(supabaseClient)
      results.verified = verifyResult.verified
      results.cancelled += verifyResult.cancelled
      results.errors.push(...verifyResult.errors)
    }

    // Step 2: Process ready-to-send emails
    if (action === 'process' || action === 'send' || action === 'daily') {
      const sendResult = await processReadyEmails(supabaseClient, sendgridApiKey)
      results.sent = sendResult.sent
      results.failed = sendResult.failed
      results.errors.push(...sendResult.errors)
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// DAILY REFRESH - Find new qualifying accounts
// ============================================================================

async function runDailyRefresh(supabase: any, specificAutomationId: string | null = null): Promise<{
  automationsProcessed: number,
  totalAdded: number,
  totalRemoved: number,
  errors: string[]
}> {
  const errors: string[] = []
  let automationsProcessed = 0
  let totalAdded = 0
  let totalRemoved = 0

  // Get automations to process
  let query = supabase
    .from('automations')
    .select('*')

  if (specificAutomationId) {
    // Only process the specified automation (for activation)
    query = query.eq('id', specificAutomationId)
  } else {
    // Daily refresh - only active automations
    query = query.in('status', ['Active', 'active'])
  }

  const { data: automations, error } = await query

  if (error) {
    errors.push(`Failed to get active automations: ${error.message}`)
    return { automationsProcessed, totalAdded, totalRemoved, errors }
  }

  for (const automation of (automations || [])) {
    try {
      // Get existing scheduled emails for this automation
      const { data: existingEmails } = await supabase
        .from('scheduled_emails')
        .select('account_id, template_id, qualification_value')
        .eq('automation_id', automation.id)
        .in('status', ['Pending', 'Processing'])

      const existingKeys = new Set(
        (existingEmails || []).map((e: any) => `${e.account_id}:${e.template_id}:${e.qualification_value}`)
      )

      // Get filter config and find date trigger rules
      const filterConfig = automation.filter_config || { groups: [] }
      const dateTriggerRules = extractDateTriggerRules(filterConfig)

      // Get trigger node for timing
      const nodes = automation.nodes || []
      const triggerNode = nodes.find((n: any) => n.type === 'trigger')
      const sendTime = triggerNode?.config?.time || '09:00'

      // Get all accounts that match base criteria
      let accountsQuery = supabase
        .from('accounts')
        .select('*')
        .or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false')

      // Only filter by owner if automation has an owner (not a system default)
      if (automation.owner_id) {
        accountsQuery = accountsQuery.eq('owner_id', automation.owner_id)
      }

      const { data: accounts } = await accountsQuery

      if (!accounts || accounts.length === 0) continue

      // Get policies for these accounts (needed for date-based and policy type filters)
      const accountIds = accounts.map((a: any) => a.account_unique_id)
      const { data: policies } = await supabase
        .from('policies')
        .select('account_id, policy_lob, expiration_date, effective_date, policy_status, policy_term')
        .in('account_id', accountIds)
        .eq('policy_status', 'Active')

      // Get all template keys used in nodes (for master automation synced nodes)
      const templateKeys: string[] = []
      for (const node of nodes) {
        if (node.type === 'send_email' && node.config?.templateKey && !node.config?.template) {
          templateKeys.push(node.config.templateKey)
        }
      }

      // Build templateKey -> templateId map for this user's templates
      const templateIdMap: Record<string, string> = {}
      if (templateKeys.length > 0) {
        const { data: userTemplates } = await supabase
          .from('email_templates')
          .select('id, default_key')
          .eq('owner_id', automation.owner_id)
          .in('default_key', templateKeys)

        ;(userTemplates || []).forEach((t: any) => {
          if (t.default_key) {
            templateIdMap[t.default_key] = t.id
          }
        })
      }

      // Build email schedule from workflow nodes (with templateKey resolution)
      const emailSchedule = buildEmailSchedule(nodes, templateIdMap)

      // Fetch template details for admin review
      const templateIds = [...new Set(emailSchedule.map(e => e.templateId).filter(Boolean))]
      if (templateIds.length === 0) {
        // No valid templates found, skip this automation
        errors.push(`No templates found for automation ${automation.name} - check templateKey mappings`)
        continue
      }

      const { data: templates } = await supabase
        .from('email_templates')
        .select('id, from_email, from_name, subject')
        .in('id', templateIds)

      const templateMap: Record<string, any> = {}
      ;(templates || []).forEach((t: any) => {
        templateMap[t.id] = t
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const newEmails: any[] = []

      // Calculate 1 year from now for pre-schedule cap
      const oneYearFromNow = new Date(today)
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

      // Filter accounts based on non-date filter rules (policy type, etc.)
      const filteredAccounts = filterAccountsByConfig(accounts, policies || [], filterConfig)

      // Handle non-date-based automations (immediate/activation-based)
      if (dateTriggerRules.length === 0) {
        // No date triggers - schedule emails starting from today for all matching accounts
        for (const account of filteredAccounts) {
          for (const emailStep of emailSchedule) {
            // Calculate send date based on workflow delay from today
            const sendDate = new Date(today)
            sendDate.setDate(sendDate.getDate() + emailStep.daysOffset)

            const [hours, minutes] = sendTime.split(':').map(Number)
            sendDate.setHours(hours, minutes, 0, 0)

            // If first email (no delay) and time has passed today, send tomorrow
            if (emailStep.daysOffset === 0 && sendDate < new Date()) {
              sendDate.setDate(sendDate.getDate() + 1)
            }

            // Use 'immediate' as qualification value for non-date-based automations
            const qualificationValue = 'immediate'
            const uniqueKey = `${account.account_unique_id}:${emailStep.templateId}:${qualificationValue}`

            if (existingKeys.has(uniqueKey)) continue

            const template = templateMap[emailStep.templateId] || {}

            newEmails.push({
              owner_id: account.owner_id,
              automation_id: automation.id,
              account_id: account.account_unique_id,
              template_id: emailStep.templateId,
              recipient_email: account.person_email || account.email,
              recipient_name: account.primary_contact_first_name
                ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
                : account.name,
              scheduled_for: sendDate.toISOString(),
              status: 'Pending',
              qualification_value: qualificationValue,
              trigger_field: 'activation',
              node_id: emailStep.nodeId,
              requires_verification: false, // No verification needed for immediate sends
              from_email: template.from_email,
              from_name: template.from_name,
              subject: template.subject
            })

            existingKeys.add(uniqueKey)
          }
        }
      } else {
        // Date-based automation - process with trigger dates
        for (const account of filteredAccounts) {
          const accountPolicies = (policies || []).filter((p: any) => p.account_id === account.account_unique_id)

          for (const rule of dateTriggerRules) {
            const triggerDates: { date: Date, field: string, daysBeforeTrigger: number }[] = []

            if (rule.field === 'policy_expiration' || rule.field === 'policy_effective') {
              const dateField = rule.field === 'policy_expiration' ? 'expiration_date' : 'effective_date'

              for (const policy of accountPolicies) {
                // Check policy type filter
                if (rule.policyType) {
                  const policyTypes = rule.policyType.split(',').map((t: string) => t.toLowerCase().trim())
                  if (!policyTypes.some((t: string) => policy.policy_lob?.toLowerCase().includes(t))) {
                    continue
                  }
                }

                // Check policy term filter
                if (rule.policyTerm) {
                  const termValue = rule.policyTerm.toLowerCase().trim()
                  const policyTerm = (policy.policy_term || '').toLowerCase().trim()
                  // Match "6 months", "6 month", "12 months", "12 month", etc.
                  if (!policyTerm.includes(termValue.replace(' months', '').replace(' month', ''))) {
                    continue
                  }
                }

                if (policy[dateField]) {
                  triggerDates.push({
                    field: rule.field,
                    date: new Date(policy[dateField]),
                    daysBeforeTrigger: rule.daysBeforeTrigger || 0
                  })
                }
              }
            } else if (rule.field === 'account_created' && account.created_at) {
              triggerDates.push({
                field: rule.field,
                date: new Date(account.created_at),
                daysBeforeTrigger: rule.daysBeforeTrigger || 0
              })
            }

            for (const triggerDate of triggerDates) {
              for (const emailStep of emailSchedule) {
                // Calculate first qualification date (trigger date - days before trigger)
                // Then add workflow delays for subsequent emails
                const firstQualificationDate = new Date(triggerDate.date)
                firstQualificationDate.setDate(firstQualificationDate.getDate() - triggerDate.daysBeforeTrigger)

                // Send date = first qualification date + workflow delay offset
                const sendDate = new Date(firstQualificationDate)
                sendDate.setDate(sendDate.getDate() + emailStep.daysOffset)

                const [hours, minutes] = sendTime.split(':').map(Number)
                sendDate.setHours(hours, minutes, 0, 0)

                // Skip if send date is in the past
                if (sendDate < today) continue

                // Skip if send date is more than 1 year in the future
                if (sendDate > oneYearFromNow) continue

                const qualificationValue = triggerDate.date.toISOString().split('T')[0]
                const uniqueKey = `${account.account_unique_id}:${emailStep.templateId}:${qualificationValue}`

                if (existingKeys.has(uniqueKey)) continue

                const template = templateMap[emailStep.templateId] || {}

                newEmails.push({
                  owner_id: account.owner_id,
                  automation_id: automation.id,
                  account_id: account.account_unique_id,
                  template_id: emailStep.templateId,
                  recipient_email: account.person_email || account.email,
                  recipient_name: account.primary_contact_first_name
                    ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
                    : account.name,
                  scheduled_for: sendDate.toISOString(),
                  status: 'Pending',
                  qualification_value: qualificationValue,
                  trigger_field: triggerDate.field,
                  node_id: emailStep.nodeId,
                  requires_verification: true,
                  from_email: template.from_email,
                  from_name: template.from_name,
                  subject: template.subject
                })

                existingKeys.add(uniqueKey)
              }
            }
          }
        }
      }

      // Insert new emails in batches
      for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
        const batch = newEmails.slice(i, i + BATCH_SIZE)
        const { error: insertError } = await supabase
          .from('scheduled_emails')
          .insert(batch)

        if (insertError) {
          errors.push(`Batch insert error for ${automation.name}: ${insertError.message}`)
        } else {
          totalAdded += batch.length
        }
      }

      automationsProcessed++
    } catch (err: any) {
      errors.push(`Failed to refresh automation ${automation.name}: ${err.message}`)
    }
  }

  return { automationsProcessed, totalAdded, totalRemoved, errors }
}

// ============================================================================
// 24-HOUR VERIFICATION
// ============================================================================

async function runVerification(supabase: any): Promise<{ verified: number, cancelled: number, errors: string[] }> {
  const errors: string[] = []
  let verified = 0
  let cancelled = 0

  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Get emails needing verification (scheduled within next 24 hours)
  const { data: emails, error } = await supabase
    .from('scheduled_emails')
    .select(`
      *,
      account:accounts(*),
      automation:automations(id, name, status, filter_config)
    `)
    .eq('status', 'Pending')
    .eq('requires_verification', true)
    .lte('scheduled_for', in24Hours.toISOString())
    .gte('scheduled_for', now.toISOString())
    .order('scheduled_for')
    .limit(100)

  if (error) {
    errors.push(`Failed to get emails for verification: ${error.message}`)
    return { verified, cancelled, errors }
  }

  for (const email of (emails || [])) {
    try {
      const qualifyResult = await verifyAccountQualifies(supabase, email)

      if (qualifyResult.qualifies) {
        // Mark as verified
        await supabase
          .from('scheduled_emails')
          .update({ requires_verification: false, updated_at: new Date().toISOString() })
          .eq('id', email.id)
        verified++
      } else {
        // Cancel the email
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'Cancelled',
            error_message: qualifyResult.reason,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)
        cancelled++
      }
    } catch (err: any) {
      errors.push(`Error verifying email ${email.id}: ${err.message}`)
    }
  }

  return { verified, cancelled, errors }
}

async function verifyAccountQualifies(
  supabase: any,
  email: ScheduledEmail
): Promise<{ qualifies: boolean, reason?: string }> {
  const { automation, account } = email

  // Check if automation is still active
  if (automation && automation.status !== 'Active' && automation.status !== 'active') {
    return { qualifies: false, reason: 'Automation is not active' }
  }

  // Check if account exists and hasn't opted out
  if (!account) {
    return { qualifies: false, reason: 'Account not found' }
  }

  if (account.person_has_opted_out_of_email) {
    return { qualifies: false, reason: 'Account has opted out of email' }
  }

  // Check if email address is valid
  const recipientEmail = email.recipient_email || account.person_email || account.email
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { qualifies: false, reason: 'Invalid or missing email address' }
  }

  // Check unsubscribe list
  const { data: unsubscribed } = await supabase
    .from('unsubscribes')
    .select('id')
    .ilike('email', recipientEmail.trim())
    .limit(1)

  if (unsubscribed && unsubscribed.length > 0) {
    return { qualifies: false, reason: 'Email is on unsubscribe list' }
  }

  // Verify the trigger condition still applies (for policy-based triggers)
  if (email.trigger_field === 'policy_expiration' || email.trigger_field === 'policy_effective') {
    const dateField = email.trigger_field === 'policy_expiration' ? 'expiration_date' : 'effective_date'

    const { data: policies } = await supabase
      .from('policies')
      .select('*')
      .eq('account_id', email.account_id)
      .eq('policy_status', 'Active')
      .eq(dateField, email.qualification_value)

    if (!policies || policies.length === 0) {
      return {
        qualifies: false,
        reason: `Policy with ${email.trigger_field} = ${email.qualification_value} no longer exists or is inactive`
      }
    }
  }

  // Check template-level deduplication (same template sent in last 7 days)
  if (email.template_id) {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentSends } = await supabase
      .from('email_logs')
      .select('id')
      .eq('template_id', email.template_id)
      .ilike('to_email', recipientEmail.trim())
      .gte('sent_at', sevenDaysAgo.toISOString())
      .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
      .limit(1)

    if (recentSends && recentSends.length > 0) {
      return { qualifies: false, reason: 'Template already sent to this recipient within 7 days' }
    }
  }

  return { qualifies: true }
}

// ============================================================================
// PROCESS READY EMAILS - Send via SendGrid
// ============================================================================

async function processReadyEmails(
  supabase: any,
  sendgridApiKey: string | undefined
): Promise<{ sent: number, failed: number, errors: string[] }> {
  const errors: string[] = []
  let sent = 0
  let failed = 0

  // Get ready emails (verified or no verification required)
  const { data: emails, error } = await supabase
    .from('scheduled_emails')
    .select(`
      *,
      account:accounts(*),
      template:email_templates(*)
    `)
    .eq('status', 'Pending')
    .lte('scheduled_for', new Date().toISOString())
    .or('requires_verification.is.null,requires_verification.eq.false')
    .order('scheduled_for')
    .limit(MAX_EMAILS_PER_RUN)

  if (error) {
    errors.push(`Failed to get ready emails: ${error.message}`)
    return { sent, failed, errors }
  }

  for (const email of (emails || [])) {
    try {
      // Mark as processing
      await supabase
        .from('scheduled_emails')
        .update({
          status: 'Processing',
          last_attempt_at: new Date().toISOString(),
          attempts: (email.attempts || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', email.id)

      // Final deduplication check
      const recipientEmail = email.recipient_email || email.account?.person_email || email.account?.email
      if (email.template_id && recipientEmail) {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const { data: recentSends } = await supabase
          .from('email_logs')
          .select('id')
          .eq('template_id', email.template_id)
          .ilike('to_email', recipientEmail.trim())
          .gte('sent_at', sevenDaysAgo.toISOString())
          .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
          .limit(1)

        if (recentSends && recentSends.length > 0) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: 'Template already sent to this recipient within 7 days',
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id)
          continue
        }
      }

      // Create email_log first to get ID for Reply-To tracking
      const { data: emailLog, error: logError } = await supabase
        .from('email_logs')
        .insert({
          owner_id: email.owner_id,
          automation_id: email.automation_id,
          account_id: email.account_id,
          template_id: email.template_id,
          to_email: recipientEmail,
          to_name: email.recipient_name,
          from_email: email.from_email || email.template?.from_email || 'noreply@example.com',
          from_name: email.from_name || email.template?.from_name || 'Marketing',
          subject: email.subject || email.template?.subject,
          status: 'Queued',
          queued_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (logError || !emailLog) {
        throw new Error(`Failed to create email log: ${logError?.message || 'Unknown error'}`)
      }

      // Send the email (pass emailLogId for Reply-To tracking)
      const sendResult = await sendEmailViaSendGrid(email, sendgridApiKey, supabase, emailLog.id)

      if (sendResult.success) {
        // Update email_log with SendGrid message ID and sent status
        await supabase
          .from('email_logs')
          .update({
            status: 'Sent',
            sent_at: new Date().toISOString(),
            sendgrid_message_id: sendResult.messageId,
            reply_to: sendResult.replyTo,
            custom_message_id: sendResult.customMessageId,
            updated_at: new Date().toISOString()
          })
          .eq('id', emailLog.id)

        // Update scheduled email as sent
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'Sent',
            email_log_id: emailLog.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)

        sent++
      } else {
        // Update email_log as failed
        await supabase
          .from('email_logs')
          .update({
            status: 'Failed',
            failed_at: new Date().toISOString(),
            error_message: sendResult.error,
            updated_at: new Date().toISOString()
          })
          .eq('id', emailLog.id)
        // Check if we should retry
        const attempts = (email.attempts || 0) + 1
        const maxAttempts = email.max_attempts || 3
        const shouldRetry = attempts < maxAttempts

        await supabase
          .from('scheduled_emails')
          .update({
            status: shouldRetry ? 'Pending' : 'Failed',
            error_message: sendResult.error,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)

        if (!shouldRetry) {
          failed++
          errors.push(`Failed to send email ${email.id}: ${sendResult.error}`)
        }
      }
    } catch (err: any) {
      errors.push(`Error processing email ${email.id}: ${err.message}`)
      failed++

      await supabase
        .from('scheduled_emails')
        .update({
          status: 'Failed',
          error_message: err.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', email.id)
    }
  }

  return { sent, failed, errors }
}

// ============================================================================
// SENDGRID INTEGRATION
// ============================================================================

async function sendEmailViaSendGrid(
  email: ScheduledEmail,
  apiKey: string | undefined,
  supabase: any,
  emailLogId: number
): Promise<{ success: boolean, messageId?: string, replyTo?: string, customMessageId?: string, error?: string }> {
  const template = email.template
  const account = email.account || {}

  // Fetch user settings for signature and agency info
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('signature_html, agency_name, agency_address, agency_phone, agency_website')
    .eq('user_id', email.owner_id)
    .single()

  // Get email content
  const fromEmail = email.from_email || template?.from_email

  // Get sender domain for inbound parse (reply tracking)
  let senderDomain: { domain: string, inbound_parse_enabled: boolean, inbound_subdomain: string } | null = null
  if (fromEmail) {
    const domainPart = fromEmail.split('@')[1]
    if (domainPart) {
      const { data: domainData } = await supabase
        .from('sender_domains')
        .select('domain, inbound_parse_enabled, inbound_subdomain')
        .eq('owner_id', email.owner_id)
        .eq('domain', domainPart)
        .eq('status', 'verified')
        .single()
      senderDomain = domainData
    }
  }
  const fromName = email.from_name || template?.from_name || 'Marketing Team'
  const subject = email.subject || template?.subject
  const recipientEmail = email.recipient_email || account.person_email || account.email
  const recipientName = email.recipient_name || account.name

  // Validate required fields
  if (!fromEmail) {
    return { success: false, error: 'Missing from_email' }
  }
  if (!recipientEmail) {
    return { success: false, error: 'Missing recipient email' }
  }
  if (!template) {
    return { success: false, error: 'Template not found' }
  }

  // Apply merge fields to template content
  const baseHtmlContent = applyMergeFields(template.html_content || '', email, account)
  const textContent = applyMergeFields(template.text_content || '', email, account)
  const finalSubject = applyMergeFields(subject || 'No Subject', email, account)

  // Build email footer with signature, company info, and unsubscribe
  const emailFooter = buildEmailFooter(userSettings, email)
  const htmlContent = baseHtmlContent + emailFooter

  // Build custom Message-ID for reply tracking
  // Format: <isg-{email_log_id}-{timestamp}@{domain}>
  // This allows us to match replies via the In-Reply-To header
  const domainPart = fromEmail.split('@')[1] || 'isgmarketing.com'
  const customMessageId = `<isg-${emailLogId}-${Date.now()}@${domainPart}>`

  // Reply-To is the sender's actual email so they receive replies directly
  // We track replies by matching the In-Reply-To header against our custom Message-ID
  const replyToAddress = fromEmail

  // Dry run mode if no API key
  if (!apiKey) {
    console.log(`[DRY RUN] Would send email:`)
    console.log(`  To: ${recipientEmail}`)
    console.log(`  From: ${fromEmail}`)
    console.log(`  Reply-To: ${replyToAddress}`)
    console.log(`  Message-ID: ${customMessageId}`)
    console.log(`  Subject: ${finalSubject}`)
    return { success: true, messageId: `dry-run-${Date.now()}`, replyTo: replyToAddress }
  }

  // Build SendGrid payload
  const payload: Record<string, any> = {
    personalizations: [{
      to: [{
        email: recipientEmail,
        name: recipientName || undefined
      }],
      // Custom args for webhook tracking
      custom_args: {
        scheduled_email_id: email.id,
        automation_id: email.automation_id || '',
        account_id: email.account_id,
        owner_id: email.owner_id,
        email_log_id: emailLogId.toString()
      }
    }],
    from: {
      email: fromEmail,
      name: fromName
    },
    reply_to: {
      email: replyToAddress,
      name: fromName
    },
    subject: finalSubject,
    content: [
      { type: 'text/plain', value: textContent || 'Please view this email in HTML format.' },
      { type: 'text/html', value: htmlContent }
    ],
    // Custom headers for reply tracking
    headers: {
      'Message-ID': customMessageId
    },
    tracking_settings: {
      click_tracking: { enable: true, enable_text: false },
      open_tracking: { enable: true },
      subscription_tracking: { enable: false } // We handle our own unsubscribe
    },
    // Add categories for SendGrid dashboard organization
    categories: [
      email.automation_id ? 'automation' : 'mass_email',
      `owner_${email.owner_id}`
    ].filter(Boolean)
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (response.ok || response.status === 202) {
      // SendGrid returns 202 Accepted for successful sends
      const messageId = response.headers.get('X-Message-Id') || `sg-${Date.now()}`
      return { success: true, messageId, replyTo: replyToAddress, customMessageId }
    } else {
      const errorBody = await response.text()
      let errorMessage = `SendGrid error: ${response.status}`
      try {
        const errorJson = JSON.parse(errorBody)
        errorMessage = errorJson.errors?.map((e: any) => e.message).join(', ') || errorMessage
      } catch {
        errorMessage = `${errorMessage} - ${errorBody.substring(0, 200)}`
      }
      return { success: false, error: errorMessage }
    }
  } catch (err: any) {
    return { success: false, error: `Network error: ${err.message}` }
  }
}

// ============================================================================
// MERGE FIELDS
// ============================================================================

function applyMergeFields(content: string, email: ScheduledEmail, account: Record<string, any>): string {
  const mergeFields: Record<string, string> = {
    // Account fields
    '{{first_name}}': account.primary_contact_first_name || '',
    '{{last_name}}': account.primary_contact_last_name || '',
    '{{full_name}}': [account.primary_contact_first_name, account.primary_contact_last_name].filter(Boolean).join(' ') || account.name || '',
    '{{name}}': account.name || '',
    '{{company_name}}': account.name || '',
    '{{email}}': account.person_email || account.email || email.recipient_email || '',
    '{{phone}}': account.phone || '',

    // Address fields
    '{{address}}': account.billing_street || '',
    '{{city}}': account.billing_city || '',
    '{{state}}': account.billing_state || '',
    '{{zip}}': account.billing_postal_code || '',
    '{{postal_code}}': account.billing_postal_code || '',

    // Recipient fields
    '{{recipient_name}}': email.recipient_name || '',
    '{{recipient_email}}': email.recipient_email || '',

    // Date fields
    '{{today}}': new Date().toLocaleDateString('en-US'),
    '{{current_year}}': new Date().getFullYear().toString(),

    // Trigger-specific fields
    '{{trigger_date}}': email.qualification_value || '',
  }

  let result = content
  for (const [field, value] of Object.entries(mergeFields)) {
    // Case-insensitive replacement
    result = result.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'gi'), value)
  }

  return result
}

// ============================================================================
// EMAIL FOOTER BUILDER
// ============================================================================

function buildEmailFooter(userSettings: any, email: ScheduledEmail): string {
  // Single unsubscribe URL for all users - set in Supabase Edge Function secrets
  const unsubscribeBaseUrl = Deno.env.get('UNSUBSCRIBE_URL') || 'https://app.isgmarketing.com/unsubscribe'

  // Build unsubscribe URL with email ID for tracking
  const unsubscribeUrl = `${unsubscribeBaseUrl}?id=${email.id}&email=${encodeURIComponent(email.recipient_email)}`

  let footer = ''

  // 1. User signature (if exists)
  if (userSettings?.signature_html) {
    footer += `
      <div style="margin-top: 30px; font-family: Arial, sans-serif;">
        ${userSettings.signature_html}
      </div>
    `
  }

  // 2. Company info line (grey, single line)
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

  // 3. Unsubscribe link (below company info)
  footer += `
    <div style="margin-top: 15px; font-family: Arial, sans-serif; font-size: 11px; text-align: center;">
      <a href="${unsubscribeUrl}" style="color: #888888; text-decoration: underline;">Unsubscribe from these emails</a>
    </div>
  `

  return footer
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractDateTriggerRules(filterConfig: any): any[] {
  const rules: any[] = []
  const groups = filterConfig?.groups || []

  for (const group of groups) {
    const groupRules = group.rules || []

    // Find all date-based rules in this group for the same field
    const dateRulesByField: Record<string, any[]> = {}

    for (const rule of groupRules) {
      if (['policy_expiration', 'policy_effective', 'account_created'].includes(rule.field)) {
        if (['in_next_days', 'in_last_days', 'less_than_days_future', 'more_than_days_future'].includes(rule.operator)) {
          if (!dateRulesByField[rule.field]) {
            dateRulesByField[rule.field] = []
          }
          dateRulesByField[rule.field].push(rule)
        }
      }
    }

    // For each field, calculate the "days before trigger" for first email
    for (const [field, fieldRules] of Object.entries(dateRulesByField)) {
      // The INNER bound (more_than_days_future) is when the email journey STARTS
      // The OUTER bound (less_than_days_future) is just for preview/pool visibility
      //
      // e.g., "more_than_days_future: 80" AND "less_than_days_future: 90"
      // - Days 90-81: Account is visible in preview (in the window)
      // - Day 80: First email sends (hits the inner bound, journey starts!)
      // - Days 79-0: Subsequent emails based on workflow delays
      //
      // So first email date = trigger_date - inner_bound (more_than value)

      let daysBeforeTrigger = 0

      for (const rule of fieldRules) {
        const value = parseInt(rule.value, 10) || 0

        if (rule.operator === 'in_next_days') {
          // "in next 30 days" → send at day 30 before trigger
          daysBeforeTrigger = Math.max(daysBeforeTrigger, value)
        } else if (rule.operator === 'more_than_days_future') {
          // "more than 80 days from now" → this is when email journey STARTS
          // First email sends when they hit this threshold
          daysBeforeTrigger = Math.max(daysBeforeTrigger, value)
        } else if (rule.operator === 'less_than_days_future') {
          // "less than 90 days from now" → outer bound, just for preview
          // Only use this if there's no inner bound defined
          if (daysBeforeTrigger === 0) {
            daysBeforeTrigger = value
          }
        } else if (rule.operator === 'in_last_days') {
          // "in last 30 days" → trigger date is in the past, send X days after trigger
          daysBeforeTrigger = -value // negative means days AFTER the trigger date
        }
      }

      // Only add rule if we have a valid send date
      if (daysBeforeTrigger !== 0) {
        rules.push({
          field,
          daysBeforeTrigger,
          policyType: groupRules.find((r: any) => r.field === 'active_policy_type' || r.field === 'policy_type')?.value,
          policyTerm: groupRules.find((r: any) => r.field === 'policy_term')?.value,
          // Keep original rules for reference
          originalRules: fieldRules
        })
      }
    }
  }

  return rules
}

function buildEmailSchedule(nodes: any[], templateIdMap: Record<string, string> = {}): { nodeId: string, templateId: string, daysOffset: number }[] {
  const schedule: { nodeId: string, templateId: string, daysOffset: number }[] = []
  let currentDelay = 0

  const processNodes = (nodeList: any[]) => {
    for (const node of nodeList) {
      // Check for template ID (direct UUID) or templateKey (from master automation sync)
      let templateId = node.config?.template
      if (!templateId && node.config?.templateKey) {
        // Look up template ID from the map (resolved from default_key)
        templateId = templateIdMap[node.config.templateKey]
      }

      if (node.type === 'send_email' && templateId) {
        schedule.push({
          nodeId: node.id,
          templateId: templateId,
          daysOffset: currentDelay
        })
      } else if (node.type === 'delay') {
        const duration = node.config?.duration || 0
        const unit = node.config?.unit || 'days'
        if (unit === 'days') {
          currentDelay += duration
        } else if (unit === 'weeks') {
          currentDelay += duration * 7
        } else if (unit === 'hours') {
          currentDelay += duration / 24
        }
      }

      if (node.branches?.yes) {
        processNodes(node.branches.yes)
      }
    }
  }

  const workflowNodes = nodes.filter((n: any) => n.type !== 'entry_criteria' && n.type !== 'trigger')
  processNodes(workflowNodes)

  return schedule
}

/**
 * Filter accounts based on non-date filter rules in the filter config
 * Handles filters like customer_status, policy_type, etc.
 */
function filterAccountsByConfig(accounts: any[], policies: any[], filterConfig: any): any[] {
  const groups = filterConfig?.groups || []

  if (groups.length === 0) {
    return accounts // No filters, return all accounts
  }

  return accounts.filter(account => {
    const accountPolicies = policies.filter((p: any) => p.account_id === account.account_unique_id)

    // Check if account matches ANY group (OR between groups)
    return groups.some((group: any) => {
      const rules = group.rules || []

      // Check if account matches ALL rules in this group (AND within group)
      return rules.every((rule: any) => {
        // Skip date-based rules - they're handled separately
        if (['policy_expiration', 'policy_effective', 'account_created'].includes(rule.field)) {
          if (['in_next_days', 'in_last_days', 'less_than_days_future', 'more_than_days_future'].includes(rule.operator)) {
            return true // Skip date rules, they're handled in the scheduling logic
          }
        }

        const value = (rule.value || '').toLowerCase().trim()

        switch (rule.field) {
          case 'customer_status':
          case 'account_status':
            const accountStatus = (account.customer_status || account.account_status || '').toLowerCase()
            return matchValue(accountStatus, value, rule.operator)

          case 'active_policy_type':
          case 'policy_type':
            // Check if account has a policy of the specified type
            return accountPolicies.some((p: any) => {
              const policyLob = (p.policy_lob || '').toLowerCase()
              return matchValue(policyLob, value, rule.operator)
            })

          case 'policy_term':
            // Check if account has a policy with the specified term
            return accountPolicies.some((p: any) => {
              const policyTerm = (p.policy_term || '').toLowerCase()
              return matchValue(policyTerm, value, rule.operator)
            })

          case 'state':
          case 'billing_state':
            const state = (account.billing_state || account.state || '').toLowerCase()
            return matchValue(state, value, rule.operator)

          case 'city':
          case 'billing_city':
            const city = (account.billing_city || account.city || '').toLowerCase()
            return matchValue(city, value, rule.operator)

          case 'has_email':
            const hasEmail = !!(account.person_email || account.email)
            return rule.operator === 'equals' ? hasEmail === (value === 'true') : hasEmail !== (value === 'true')

          default:
            // For unknown fields, try to match against account properties
            const fieldValue = (account[rule.field] || '').toString().toLowerCase()
            return matchValue(fieldValue, value, rule.operator)
        }
      })
    })
  })
}

/**
 * Match a value against a filter value based on operator
 */
function matchValue(actualValue: string, filterValue: string, operator: string): boolean {
  switch (operator) {
    case 'equals':
    case 'is':
      return actualValue === filterValue
    case 'not_equals':
    case 'is_not':
      return actualValue !== filterValue
    case 'contains':
      return actualValue.includes(filterValue)
    case 'not_contains':
      return !actualValue.includes(filterValue)
    case 'starts_with':
      return actualValue.startsWith(filterValue)
    case 'ends_with':
      return actualValue.endsWith(filterValue)
    case 'is_empty':
      return actualValue === ''
    case 'is_not_empty':
      return actualValue !== ''
    case 'in':
      // Value is comma-separated list
      const inValues = filterValue.split(',').map(v => v.trim().toLowerCase())
      return inValues.includes(actualValue)
    case 'not_in':
      const notInValues = filterValue.split(',').map(v => v.trim().toLowerCase())
      return !notInValues.includes(actualValue)
    default:
      return actualValue === filterValue
  }
}
