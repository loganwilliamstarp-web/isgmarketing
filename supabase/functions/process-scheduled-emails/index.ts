// supabase/functions/process-scheduled-emails/index.ts
// Edge function to process scheduled emails with SendGrid integration
// Handles: daily refresh, 24-hour verification, email sending
// Should be invoked via cron job or webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    try {
      const body = await req.json()
      action = body.action || 'process'
    } catch {
      // No body or invalid JSON, use default action
    }

    const results = {
      action,
      verified: 0,
      cancelled: 0,
      sent: 0,
      failed: 0,
      refreshed: 0,
      newScheduled: 0,
      errors: [] as string[]
    }

    // Step 0: Daily refresh - find new qualifying accounts for active automations
    if (action === 'refresh' || action === 'daily') {
      const refreshResult = await runDailyRefresh(supabaseClient)
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

async function runDailyRefresh(supabase: any): Promise<{
  automationsProcessed: number,
  totalAdded: number,
  totalRemoved: number,
  errors: string[]
}> {
  const errors: string[] = []
  let automationsProcessed = 0
  let totalAdded = 0
  let totalRemoved = 0

  // Get all active automations
  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .in('status', ['Active', 'active'])

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

      if (dateTriggerRules.length === 0) {
        // No date-based triggers - skip this automation
        continue
      }

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

      // Get policies for these accounts
      const accountIds = accounts.map((a: any) => a.account_unique_id)
      const { data: policies } = await supabase
        .from('policies')
        .select('account_id, policy_lob, expiration_date, effective_date, policy_status')
        .in('account_id', accountIds)
        .eq('policy_status', 'Active')

      // Build email schedule from workflow nodes
      const emailSchedule = buildEmailSchedule(nodes)

      // Fetch template details for admin review
      const templateIds = [...new Set(emailSchedule.map(e => e.templateId))]
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

      for (const account of accounts) {
        const accountPolicies = (policies || []).filter((p: any) => p.account_id === account.account_unique_id)

        for (const rule of dateTriggerRules) {
          const triggerDates: { date: Date, field: string }[] = []

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

              if (policy[dateField]) {
                triggerDates.push({
                  field: rule.field,
                  date: new Date(policy[dateField])
                })
              }
            }
          } else if (rule.field === 'account_created' && account.created_at) {
            triggerDates.push({
              field: rule.field,
              date: new Date(account.created_at)
            })
          }

          for (const triggerDate of triggerDates) {
            for (const emailStep of emailSchedule) {
              const sendDate = new Date(triggerDate.date)
              sendDate.setDate(sendDate.getDate() + emailStep.daysOffset)

              const [hours, minutes] = sendTime.split(':').map(Number)
              sendDate.setHours(hours, minutes, 0, 0)

              if (sendDate < today) continue

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

      // Send the email
      const sendResult = await sendEmailViaSendGrid(email, sendgridApiKey)

      if (sendResult.success) {
        // Log the sent email
        const { data: emailLog } = await supabase
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
            status: 'Sent',
            sent_at: new Date().toISOString(),
            sendgrid_message_id: sendResult.messageId
          })
          .select()
          .single()

        // Update scheduled email as sent
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'Sent',
            email_log_id: emailLog?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)

        sent++
      } else {
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
  apiKey: string | undefined
): Promise<{ success: boolean, messageId?: string, error?: string }> {
  const template = email.template
  const account = email.account || {}

  // Get email content
  const fromEmail = email.from_email || template?.from_email
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
  const htmlContent = applyMergeFields(template.html_content || '', email, account)
  const textContent = applyMergeFields(template.text_content || '', email, account)
  const finalSubject = applyMergeFields(subject || 'No Subject', email, account)

  // Dry run mode if no API key
  if (!apiKey) {
    console.log(`[DRY RUN] Would send email:`)
    console.log(`  To: ${recipientEmail}`)
    console.log(`  From: ${fromEmail}`)
    console.log(`  Subject: ${finalSubject}`)
    return { success: true, messageId: `dry-run-${Date.now()}` }
  }

  // Build SendGrid payload
  const payload = {
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
        owner_id: email.owner_id
      }
    }],
    from: {
      email: fromEmail,
      name: fromName
    },
    subject: finalSubject,
    content: [
      { type: 'text/plain', value: textContent || 'Please view this email in HTML format.' },
      { type: 'text/html', value: htmlContent }
    ],
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
      return { success: true, messageId }
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
// HELPER FUNCTIONS
// ============================================================================

function extractDateTriggerRules(filterConfig: any): any[] {
  const rules: any[] = []
  const groups = filterConfig?.groups || []

  for (const group of groups) {
    for (const rule of (group.rules || [])) {
      if (['policy_expiration', 'policy_effective', 'account_created'].includes(rule.field)) {
        if (['in_next_days', 'in_last_days', 'less_than_days_future', 'more_than_days_future'].includes(rule.operator)) {
          rules.push({
            field: rule.field,
            operator: rule.operator,
            value: parseInt(rule.value, 10),
            policyType: group.rules?.find((r: any) => r.field === 'active_policy_type' || r.field === 'policy_type')?.value
          })
        }
      }
    }
  }

  return rules
}

function buildEmailSchedule(nodes: any[]): { nodeId: string, templateId: string, daysOffset: number }[] {
  const schedule: { nodeId: string, templateId: string, daysOffset: number }[] = []
  let currentDelay = 0

  const processNodes = (nodeList: any[]) => {
    for (const node of nodeList) {
      if (node.type === 'send_email' && node.config?.template) {
        schedule.push({
          nodeId: node.id,
          templateId: node.config.template,
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
