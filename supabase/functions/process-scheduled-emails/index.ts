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
const MAX_EMAILS_PER_RUN = 200
const BATCH_SIZE = 100
const MAX_ACCOUNTS_PER_REFRESH = 1000  // Process accounts in chunks to avoid timeouts

interface ScheduledEmail {
  id: string
  owner_id: string
  automation_id: string | null
  batch_id: string | null
  account_id: string
  template_id: string
  to_email: string
  to_name: string
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
    // Default to 'daily' for cron jobs (no body), 'process' for manual calls
    let action = 'daily' // default action - runs refresh, verify, and send
    let automationId: string | null = null
    let scheduledEmailId: string | null = null
    let accountOffset: number = 0  // For chunked processing of large activations
    try {
      const body = await req.json()
      action = body.action || 'daily'
      automationId = body.automationId || null
      scheduledEmailId = body.scheduledEmailId || null
      accountOffset = body.accountOffset || 0
    } catch {
      // No body or invalid JSON (e.g., cron trigger), use default 'daily' action
      console.log('[Cron] No request body - running daily action (refresh + verify + send)')
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
      errors: [] as string[],
      hasMore: false,        // Indicates if there are more accounts to process
      nextOffset: 0          // Next offset for continuation
    }

    // Step 0: Daily refresh - find new qualifying accounts for active automations
    // If automationId is provided, only refresh that specific automation
    if (action === 'refresh' || action === 'daily' || action === 'activate') {
      const refreshResult = await runDailyRefresh(supabaseClient, automationId, accountOffset)
      results.refreshed = refreshResult.automationsProcessed
      results.newScheduled = refreshResult.totalAdded
      results.cancelled += refreshResult.totalRemoved
      results.errors.push(...refreshResult.errors)
      results.hasMore = refreshResult.hasMore
      results.nextOffset = refreshResult.nextOffset
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
      const sendResult = await processReadyEmails(supabaseClient, sendgridApiKey, scheduledEmailId)
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

async function runDailyRefresh(
  supabase: any,
  specificAutomationId: string | null = null,
  accountOffset: number = 0
): Promise<{
  automationsProcessed: number,
  totalAdded: number,
  totalRemoved: number,
  errors: string[],
  hasMore: boolean,
  nextOffset: number
}> {
  const errors: string[] = []
  let automationsProcessed = 0
  let totalAdded = 0
  let totalRemoved = 0
  let hasMore = false
  let nextOffset = 0

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
    return { automationsProcessed, totalAdded, totalRemoved, errors, hasMore, nextOffset }
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

      // Get send time from automation settings
      const nodes = automation.nodes || []
      const sendTime = automation.send_time || '09:00'
      const timezone = automation.timezone || 'America/Chicago'

      // Get pacing config from entry_criteria node
      const entryCriteriaNode = nodes.find((n: any) => n.type === 'entry_criteria')
      const pacingConfig = entryCriteriaNode?.config?.pacing || { enabled: false, spreadOverDays: 7, allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }

      // Get user settings for from_email and from_name
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('from_email, from_name')
        .eq('user_id', automation.owner_id)
        .single()

      const defaultFromEmail = userSettings?.from_email || null
      const defaultFromName = userSettings?.from_name || null

      // Get accounts that match base criteria (paginated for large datasets)
      // Only include accounts with valid email validation status
      let accountsQuery = supabase
        .from('accounts')
        .select('*', { count: 'exact' })
        .or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false')
        .eq('email_validation_status', 'valid')  // Only schedule for validated emails
        .order('account_unique_id')  // Consistent ordering for pagination
        .range(accountOffset, accountOffset + MAX_ACCOUNTS_PER_REFRESH - 1)

      // Only filter by owner if automation has an owner (not a system default)
      if (automation.owner_id) {
        accountsQuery = accountsQuery.eq('owner_id', automation.owner_id)
      }

      const { data: accounts, count: totalAccounts } = await accountsQuery

      if (!accounts || accounts.length === 0) continue

      // Check if there are more accounts to process in subsequent calls
      const processedUpTo = accountOffset + accounts.length
      if (totalAccounts && processedUpTo < totalAccounts) {
        hasMore = true
        nextOffset = processedUpTo
        console.log(`[${automation.name}] Processing accounts ${accountOffset + 1}-${processedUpTo} of ${totalAccounts} (has more: true)`)
      } else {
        console.log(`[${automation.name}] Processing accounts ${accountOffset + 1}-${processedUpTo} of ${totalAccounts || accounts.length} (final batch)`)
      }

      // Get policies for these accounts (needed for date-based and policy type filters)
      // Batch the query to avoid URL length limits (max ~100 IDs per query)
      const accountIds = accounts.map((a: any) => a.account_unique_id)
      const POLICY_BATCH_SIZE = 100
      let allPolicies: any[] = []

      for (let i = 0; i < accountIds.length; i += POLICY_BATCH_SIZE) {
        const batchIds = accountIds.slice(i, i + POLICY_BATCH_SIZE)
        const { data: batchPolicies, error: batchError } = await supabase
          .from('policies')
          .select('account_id, policy_lob, expiration_date, effective_date, policy_status, policy_term')
          .in('account_id', batchIds)
          .eq('policy_status', 'Active')

        if (batchError) {
          console.log(`[${automation.name}] Policies batch error:`, batchError.message)
        } else if (batchPolicies) {
          allPolicies = allPolicies.concat(batchPolicies)
        }
      }

      const policies = allPolicies
      console.log(`[${automation.name}] Policies query: found ${policies?.length || 0} policies for ${accountIds.length} account IDs (in ${Math.ceil(accountIds.length / POLICY_BATCH_SIZE)} batches)`)
      // Debug: log sample policies
      if (policies && policies.length > 0) {
        console.log(`[${automation.name}] Sample policies:`, JSON.stringify(policies.slice(0, 3)))
      }

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

      // Debug logging (before filteredAccounts is defined)
      console.log(`[${automation.name}] Nodes:`, JSON.stringify(nodes?.map((n: any) => ({ id: n.id, type: n.type, config: n.config }))))
      console.log(`[${automation.name}] Template keys to resolve:`, templateKeys)
      console.log(`[${automation.name}] Template ID map:`, templateIdMap)
      console.log(`[${automation.name}] Email schedule:`, JSON.stringify(emailSchedule))
      console.log(`[${automation.name}] Accounts found:`, accounts?.length || 0)
      console.log(`[${automation.name}] Filter config:`, JSON.stringify(filterConfig))

      // Fetch template details for admin review
      const templateIds = [...new Set(emailSchedule.map(e => e.templateId).filter(Boolean))]
      if (templateIds.length === 0) {
        // No valid templates found, skip this automation
        errors.push(`No templates found for automation ${automation.name} - check templateKey mappings`)
        continue
      }

      const { data: templates } = await supabase
        .from('email_templates')
        .select('id, subject')
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
      console.log(`[${automation.name}] Filtered accounts:`, filteredAccounts?.length || 0)
      console.log(`[${automation.name}] Date trigger rules:`, dateTriggerRules?.length || 0)
      console.log(`[${automation.name}] Date trigger rules detail:`, JSON.stringify(dateTriggerRules))

      // Handle non-date-based automations (immediate/activation-based)
      if (dateTriggerRules.length === 0) {
        // No date triggers - schedule emails starting from today for all matching accounts
        for (const account of filteredAccounts) {
          for (const emailStep of emailSchedule) {
            // Calculate send date based on workflow delay from today
            const sendDate = new Date(today)
            sendDate.setDate(sendDate.getDate() + emailStep.daysOffset)

            // Convert to proper timezone-aware UTC time
            let scheduledForUTC = getScheduledDateTimeUTC(sendDate, sendTime, timezone)

            // If first email (no delay) and time has passed today, send tomorrow
            if (emailStep.daysOffset === 0 && new Date(scheduledForUTC) < new Date()) {
              sendDate.setDate(sendDate.getDate() + 1)
              scheduledForUTC = getScheduledDateTimeUTC(sendDate, sendTime, timezone)
            }

            // Use 'immediate' as qualification value for non-date-based automations
            const qualificationValue = 'immediate'
            const uniqueKey = `${account.account_unique_id}:${emailStep.templateId}:${qualificationValue}`

            if (existingKeys.has(uniqueKey)) continue

            // Skip accounts without email addresses
            const accountEmail = account.person_email || account.email
            if (!accountEmail) continue

            const template = templateMap[emailStep.templateId] || {}

            newEmails.push({
              owner_id: automation.owner_id,
              automation_id: automation.id,
              account_id: account.account_unique_id,
              template_id: emailStep.templateId,
              to_email: accountEmail,
              to_name: account.primary_contact_first_name
                ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
                : account.name,
              scheduled_for: scheduledForUTC,
              status: 'Pending',
              qualification_value: qualificationValue,
              trigger_field: 'activation',
              node_id: emailStep.nodeId,
              requires_verification: false, // No verification needed for immediate sends
              from_email: defaultFromEmail,
              from_name: defaultFromName,
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

                // Convert to proper timezone-aware UTC time
                const scheduledForUTC = getScheduledDateTimeUTC(sendDate, sendTime, timezone)

                // Skip if send date is in the past
                if (new Date(scheduledForUTC) < new Date()) continue

                // Skip if send date is more than 1 year in the future
                if (new Date(scheduledForUTC) > oneYearFromNow) continue

                const qualificationValue = triggerDate.date.toISOString().split('T')[0]
                const uniqueKey = `${account.account_unique_id}:${emailStep.templateId}:${qualificationValue}`

                if (existingKeys.has(uniqueKey)) continue

                // Skip accounts without email addresses
                const accountEmail = account.person_email || account.email
                if (!accountEmail) continue

                const template = templateMap[emailStep.templateId] || {}

                newEmails.push({
                  owner_id: automation.owner_id,
                  automation_id: automation.id,
                  account_id: account.account_unique_id,
                  template_id: emailStep.templateId,
                  to_email: accountEmail,
                  to_name: account.primary_contact_first_name
                    ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
                    : account.name,
                  scheduled_for: scheduledForUTC,
                  status: 'Pending',
                  qualification_value: qualificationValue,
                  trigger_field: triggerDate.field,
                  node_id: emailStep.nodeId,
                  requires_verification: true,
                  from_email: defaultFromEmail,
                  from_name: defaultFromName,
                  subject: template.subject
                })

                existingKeys.add(uniqueKey)
              }
            }
          }
        }
      }

      console.log(`[${automation.name}] New emails to insert:`, newEmails.length)
      if (newEmails.length === 0 && filteredAccounts.length > 0) {
        // Debug: check first few filtered accounts to see why no emails
        const debugAccounts = filteredAccounts.slice(0, 3)
        for (const account of debugAccounts) {
          const accountPolicies = (policies || []).filter((p: any) => p.account_id === account.account_unique_id)
          console.log(`[${automation.name}] Debug account ${account.name}:`, {
            policies: accountPolicies.map((p: any) => ({
              lob: p.policy_lob,
              exp: p.expiration_date,
              term: p.policy_term
            }))
          })
        }
      }

      // Apply pacing distribution if enabled
      let finalEmails = newEmails
      if (pacingConfig.enabled && newEmails.length > 0) {
        console.log(`[${automation.name}] Applying pacing: spread over ${pacingConfig.spreadOverDays} days, allowed days: ${pacingConfig.allowedDays?.join(', ')}`)
        finalEmails = applyPacingDistribution(
          newEmails,
          pacingConfig.spreadOverDays || 7,
          pacingConfig.allowedDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
          sendTime,
          timezone
        )
      } else if (pacingConfig.allowedDays?.length > 0 && pacingConfig.allowedDays.length < 7) {
        // Even without full pacing, respect day-of-week restrictions
        console.log(`[${automation.name}] Applying day-of-week filter: ${pacingConfig.allowedDays?.join(', ')}`)
        finalEmails = newEmails.map((email: any) => {
          const originalDate = new Date(email.scheduled_for)
          const adjustedDate = moveToNextAllowedDay(originalDate, pacingConfig.allowedDays)
          if (adjustedDate.getTime() !== originalDate.getTime()) {
            return { ...email, scheduled_for: adjustedDate.toISOString() }
          }
          return email
        })
      }

      // Insert new emails in batches
      console.log(`[${automation.name}] About to insert ${finalEmails.length} emails in batches of ${BATCH_SIZE}`)
      if (finalEmails.length > 0) {
        console.log(`[${automation.name}] Sample email to insert:`, JSON.stringify(finalEmails[0]))
      }
      for (let i = 0; i < finalEmails.length; i += BATCH_SIZE) {
        const batch = finalEmails.slice(i, i + BATCH_SIZE)
        console.log(`[${automation.name}] Inserting batch ${i / BATCH_SIZE + 1} with ${batch.length} emails`)
        const { error: insertError, data: insertedData } = await supabase
          .from('scheduled_emails')
          .insert(batch)
          .select('id')

        if (insertError) {
          console.log(`[${automation.name}] INSERT ERROR:`, insertError.message, insertError.details, insertError.hint)
          errors.push(`Batch insert error for ${automation.name}: ${insertError.message}`)
        } else {
          console.log(`[${automation.name}] Successfully inserted ${insertedData?.length || 0} emails`)
          totalAdded += batch.length
        }
      }

      automationsProcessed++
    } catch (err: any) {
      errors.push(`Failed to refresh automation ${automation.name}: ${err.message}`)
    }
  }

  return { automationsProcessed, totalAdded, totalRemoved, errors, hasMore, nextOffset }
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

  // Check email validation status - only send to validated emails
  if (account.email_validation_status !== 'valid') {
    const status = account.email_validation_status || 'unknown'
    const reason = account.email_validation_reason
    return {
      qualifies: false,
      reason: `Email validation status is '${status}'${reason ? ` (${reason})` : ''}`
    }
  }

  // Check if email address is valid
  const recipientEmail = email.to_email || account.person_email || account.email
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
  sendgridApiKey: string | undefined,
  specificEmailId: string | null = null
): Promise<{ sent: number, failed: number, errors: string[] }> {
  const errors: string[] = []
  let sent = 0
  let failed = 0

  // Build query for ready emails
  let query = supabase
    .from('scheduled_emails')
    .select(`
      *,
      account:accounts(*),
      template:email_templates(*)
    `)
    .eq('status', 'Pending')

  // If specific email ID provided, only process that one (for "Send Now" feature)
  if (specificEmailId) {
    query = query.eq('id', specificEmailId)
  } else {
    // Normal batch processing - get emails ready to send
    query = query
      .lte('scheduled_for', new Date().toISOString())
      .or('requires_verification.is.null,requires_verification.eq.false')
      .order('scheduled_for')
      .limit(MAX_EMAILS_PER_RUN)
  }

  const { data: emails, error } = await query

  if (error) {
    errors.push(`Failed to get ready emails: ${error.message}`)
    return { sent, failed, errors }
  }

  for (const email of (emails || [])) {
    try {
      // Mark as processing - use atomic check to prevent race conditions
      // Only update if status is still 'Pending' (another process may have grabbed it)
      const { data: updateResult, error: updateError } = await supabase
        .from('scheduled_emails')
        .update({
          status: 'Processing',
          last_attempt_at: new Date().toISOString(),
          attempts: (email.attempts || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', email.id)
        .eq('status', 'Pending')  // Atomic check - only update if still Pending
        .select('id')

      // If no rows updated, another process grabbed this email - skip it
      if (updateError || !updateResult || updateResult.length === 0) {
        console.log(`[Send] Skipping email ${email.id} - already being processed by another instance`)
        continue
      }

      // Get recipient email for checks
      const recipientEmail = email.to_email || email.account?.person_email || email.account?.email

      // Final unsubscribe check (catches unsubscribes after 24-hour verification)
      if (recipientEmail) {
        const { data: unsubscribed } = await supabase
          .from('unsubscribes')
          .select('id')
          .ilike('email', recipientEmail.trim())
          .limit(1)

        if (unsubscribed && unsubscribed.length > 0) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: 'Recipient unsubscribed before send',
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id)
          continue
        }

        // Also check account opt-out status
        if (email.account?.person_has_opted_out_of_email) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: 'Account opted out of email before send',
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id)
          continue
        }

        // Final email validation check - only send to validated emails
        if (email.account?.email_validation_status !== 'valid') {
          const status = email.account?.email_validation_status || 'unknown'
          const reason = email.account?.email_validation_reason
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: `Email validation status is '${status}'${reason ? ` (${reason})` : ''}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id)
          continue
        }
      }

      // Final deduplication check
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
          to_name: email.to_name,
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
        // Update email_log with SendGrid message ID, sent status, and processed content
        await supabase
          .from('email_logs')
          .update({
            status: 'Sent',
            sent_at: new Date().toISOString(),
            sendgrid_message_id: sendResult.messageId,
            reply_to: sendResult.replyTo,
            use_tracking_reply: sendResult.useTrackingReply || false,
            custom_message_id: sendResult.customMessageId,
            subject: sendResult.processedSubject,
            body_html: sendResult.processedBodyHtml,
            body_text: sendResult.processedBodyText,
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

        // Log activity for email sent
        await supabase
          .from('activity_log')
          .insert({
            owner_id: email.owner_id,
            event_type: 'email_sent',
            event_category: 'email',
            title: 'Email sent',
            description: `Email "${email.subject || email.template?.subject}" sent to ${recipientEmail}`,
            email_log_id: emailLog.id,
            account_id: email.account_id,
            automation_id: email.automation_id,
            actor_type: 'system',
            severity: 'info',
            created_at: new Date().toISOString()
          })

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

  // Fetch user settings for signature, agency info, and google review link
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('signature_html, agency_name, agency_address, agency_phone, agency_website, google_review_link')
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
  const recipientEmail = email.to_email || account.person_email || account.email
  const recipientName = email.to_name || account.name

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

  // Apply merge fields to template content (pass emailLogId for star rating URLs)
  const baseHtmlContent = applyMergeFields(template.body_html || '', email, account, emailLogId)
  const textContent = applyMergeFields(template.body_text || '', email, account, emailLogId)
  const finalSubject = applyMergeFields(subject || 'No Subject', email, account, emailLogId)

  // Build email footer with signature, company info, and unsubscribe
  const emailFooter = buildEmailFooter(userSettings, email)

  // Wrap in proper HTML email structure with paragraph styling
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
      <style>p { margin: 0 0 1em 0; } p:last-of-type { margin-bottom: 0; }</style>
      ${baseHtmlContent}
      ${emailFooter}
    </div>
  `.trim()

  // Build custom Message-ID for reply tracking
  // Format: <isg-{email_log_id}-{timestamp}@{domain}>
  // This allows us to match replies via the In-Reply-To header
  const domainPart = fromEmail.split('@')[1] || 'isgmarketing.com'
  const customMessageId = `<isg-${emailLogId}-${Date.now()}@${domainPart}>`

  // Check if sender has OAuth connected for inbox injection
  // If yes, use tracking reply address (mailbox-replies.com)
  // If no, use sender's actual email (normal flow, no tracking)
  let replyToAddress = fromEmail
  let useTrackingReply = false
  const replyDomain = Deno.env.get('REPLY_DOMAIN')

  if (replyDomain) {
    // OAuth connections are stored at agency level (profile_name)
    // First get the user's profile_name from the users table
    const { data: userData } = await supabase
      .from('users')
      .select('profile_name')
      .eq('user_unique_id', email.owner_id)
      .single()

    const agencyId = userData?.profile_name

    if (agencyId) {
      const { data: oauthConn } = await supabase
        .from('email_provider_connections')
        .select('id')
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .limit(1)

      if (oauthConn && oauthConn.length > 0) {
        // OAuth connected: use tracking reply address for inbox injection
        replyToAddress = `reply-${emailLogId}@${replyDomain}`
        useTrackingReply = true
        console.log(`Using tracking reply address: ${replyToAddress} (agency: ${agencyId})`)
      }
    }
    // No OAuth: keep replyToAddress as fromEmail (normal flow)
  }

  // Dry run mode if no API key
  if (!apiKey) {
    console.log(`[DRY RUN] Would send email:`)
    console.log(`  To: ${recipientEmail}`)
    console.log(`  From: ${fromEmail}`)
    console.log(`  Reply-To: ${replyToAddress}`)
    console.log(`  Message-ID: ${customMessageId}`)
    console.log(`  Subject: ${finalSubject}`)
    return { success: true, messageId: `dry-run-${Date.now()}`, replyTo: replyToAddress, useTrackingReply, processedSubject: finalSubject, processedBodyHtml: htmlContent, processedBodyText: textContent }
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
      return { success: true, messageId, replyTo: replyToAddress, useTrackingReply, customMessageId, processedSubject: finalSubject, processedBodyHtml: htmlContent, processedBodyText: textContent }
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

function applyMergeFields(content: string, email: ScheduledEmail, account: Record<string, any>, emailLogId?: number): string {
  // Extract first/last name from account.name if dedicated fields aren't available
  const nameParts = (account.name || '').trim().split(/\s+/)
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
    '{{first_name}}': account.primary_contact_first_name || derivedFirstName,
    '{{last_name}}': account.primary_contact_last_name || derivedLastName,
    '{{full_name}}': [account.primary_contact_first_name, account.primary_contact_last_name].filter(Boolean).join(' ') || account.name || '',
    '{{name}}': account.name || '',
    '{{company_name}}': account.name || '',
    '{{email}}': account.person_email || account.email || email.to_email || '',
    '{{phone}}': account.phone || '',

    // Address fields
    '{{address}}': account.billing_street || '',
    '{{city}}': account.billing_city || '',
    '{{state}}': account.billing_state || '',
    '{{zip}}': account.billing_postal_code || '',
    '{{postal_code}}': account.billing_postal_code || '',

    // Recipient fields
    '{{recipient_name}}': email.to_name || '',
    '{{recipient_email}}': email.to_email || '',

    // Date fields
    '{{today}}': new Date().toLocaleDateString('en-US'),
    '{{current_year}}': new Date().getFullYear().toString(),

    // Trigger-specific fields
    '{{trigger_date}}': email.qualification_value || '',

    // Star rating URLs (for periodic review emails)
    '{{rating_url_1}}': buildRatingUrl(1),
    '{{rating_url_2}}': buildRatingUrl(2),
    '{{rating_url_3}}': buildRatingUrl(3),
    '{{rating_url_4}}': buildRatingUrl(4),
    '{{rating_url_5}}': buildRatingUrl(5),
  }

  let result = content
  for (const [field, value] of Object.entries(mergeFields)) {
    // Case-insensitive replacement - handle spaces inside braces like {{ field }}
    const fieldName = field.slice(2, -2) // Remove {{ and }}
    const pattern = new RegExp(`\\{\\{\\s*${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi')
    result = result.replace(pattern, value)
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
  const unsubscribeUrl = `${unsubscribeBaseUrl}?id=${email.id}&email=${encodeURIComponent(email.to_email)}`

  let footer = ''

  // 1. User signature (if exists) - reset p margins to avoid double spacing
  if (userSettings?.signature_html) {
    footer += `
      <div style="margin-top: 20px; font-family: Arial, sans-serif;">
        <style>.email-sig p { margin: 0; }</style>
        <div class="email-sig">${userSettings.signature_html}</div>
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

/**
 * Convert a date + time in a specific timezone to a UTC ISO string
 * @param date - The date (year, month, day)
 * @param time - Time string like "10:00"
 * @param timezone - IANA timezone like "America/Chicago"
 * @returns ISO string in UTC
 *
 * Example: 10:00 AM America/Chicago = 16:00 UTC (in winter, CST = UTC-6)
 */
function getScheduledDateTimeUTC(date: Date, time: string, timezone: string): string {
  const [hours, minutes] = time.split(':').map(Number)

  // Get the timezone offset in hours (positive = behind UTC, e.g. Chicago = 6)
  const offsetHours = getTimezoneOffsetHours(timezone, date)

  // Create a UTC date by adding the offset to the local time
  // If it's 10:00 AM in Chicago (UTC-6), UTC time is 10:00 + 6 = 16:00
  const utcHours = hours + offsetHours

  // Create the UTC date
  const utcDate = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    utcHours,
    minutes,
    0,
    0
  ))

  return utcDate.toISOString()
}

/**
 * Get timezone offset in hours for a given timezone at a specific date
 * Returns positive number for timezones behind UTC (e.g., 6 for Chicago in winter)
 */
function getTimezoneOffsetHours(timezone: string, date: Date): number {
  // Common US timezone offsets in hours behind UTC (standard time)
  const standardOffsets: Record<string, number> = {
    'America/New_York': 5,       // EST: UTC-5
    'America/Chicago': 6,        // CST: UTC-6
    'America/Denver': 7,         // MST: UTC-7
    'America/Los_Angeles': 8,    // PST: UTC-8
    'America/Phoenix': 7,        // MST (no DST)
    'Pacific/Honolulu': 10,      // HST: UTC-10
    'America/Anchorage': 9,      // AKST: UTC-9
    'UTC': 0,
  }

  let offset = standardOffsets[timezone] ?? 6 // Default to CST

  // Check if the scheduled date falls within DST
  // US DST: Second Sunday in March to First Sunday in November
  const isDST = isDateInDST(date)

  // Adjust for DST (except Phoenix and Honolulu which don't observe DST)
  if (isDST && timezone !== 'America/Phoenix' && timezone !== 'Pacific/Honolulu' && timezone !== 'UTC') {
    offset -= 1 // DST moves 1 hour closer to UTC (e.g., Chicago becomes UTC-5 instead of UTC-6)
  }

  return offset
}

/**
 * Check if a date falls within US Daylight Saving Time
 * DST starts: Second Sunday in March at 2:00 AM
 * DST ends: First Sunday in November at 2:00 AM
 */
function isDateInDST(date: Date): boolean {
  const year = date.getFullYear()
  const month = date.getMonth()

  // Quick check: Jan, Feb, Dec are never DST
  if (month < 2 || month > 10) return false

  // Quick check: Apr-Oct are always DST
  if (month > 2 && month < 10) return true

  // March: DST starts on second Sunday
  if (month === 2) {
    const secondSunday = getSecondSundayOfMonth(year, 2)
    return date.getDate() >= secondSunday
  }

  // November: DST ends on first Sunday
  if (month === 10) {
    const firstSunday = getFirstSundayOfMonth(year, 10)
    return date.getDate() < firstSunday
  }

  return false
}

function getSecondSundayOfMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1).getDay()
  // Days until first Sunday (0 if first day is Sunday)
  const daysUntilFirstSunday = firstDay === 0 ? 0 : 7 - firstDay
  // Second Sunday = first Sunday + 7
  return 1 + daysUntilFirstSunday + 7
}

function getFirstSundayOfMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1).getDay()
  // Days until first Sunday (0 if first day is Sunday)
  const daysUntilFirstSunday = firstDay === 0 ? 0 : 7 - firstDay
  return 1 + daysUntilFirstSunday
}

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

  // Debug: log first few accounts for troubleshooting
  let debugCount = 0

  return accounts.filter(account => {
    const accountPolicies = policies.filter((p: any) => p.account_id === account.account_unique_id)

    // Check if account matches ANY group (OR between groups)
    const matchesAnyGroup = groups.some((group: any, groupIdx: number) => {
      const rules = group.rules || []

      // Check if account matches ALL rules in this group (AND within group)
      const matchesAllRules = rules.every((rule: any, ruleIdx: number) => {
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
            // Get all policy types for this account
            const policyTypes = accountPolicies.map((p: any) => (p.policy_lob || '').toLowerCase()).join(',')

            // For negative operators, if no policies exist, consider it a match
            if (accountPolicies.length === 0) {
              return ['is_not', 'is_not_any', 'not_equals', 'not_in'].includes(rule.operator)
            }

            return matchValue(policyTypes, value, rule.operator)

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

          case 'survey_stars':
            const surveyStars = account.survey_stars?.toString() || ''
            if (!surveyStars && rule.operator === 'is_not') return true
            if (!surveyStars) return false
            return matchValue(surveyStars, value, rule.operator)

          case 'survey_completed':
            const hasSurvey = account.survey_stars !== null && account.survey_stars !== undefined
            const wantsSurvey = value === 'true'
            return rule.operator === 'is' ? hasSurvey === wantsSurvey : hasSurvey !== wantsSurvey

          default:
            // For unknown fields, try to match against account properties
            const fieldValue = (account[rule.field] || '').toString().toLowerCase()
            return matchValue(fieldValue, value, rule.operator)
        }
      })

      // Debug log for first few accounts
      if (debugCount < 3 && !matchesAllRules) {
        console.log(`[Filter Debug] Account ${account.name} failed group ${groupIdx}`)
        console.log(`  Policies: ${accountPolicies.map((p: any) => p.policy_lob).join(', ')}`)
      }

      return matchesAllRules
    })

    if (debugCount < 3) {
      console.log(`[Filter Debug] Account ${account.name}: matchesAnyGroup=${matchesAnyGroup}, policies=${accountPolicies.length}`)
      debugCount++
    }

    return matchesAnyGroup
  })
}

/**
 * Match a value against a filter value based on operator
 * For policy type checks, actualValue may be comma-separated list of policy types
 */
function matchValue(actualValue: string, filterValue: string, operator: string): boolean {
  // Handle comma-separated actual values (e.g., account has multiple policy types)
  const actualValues = actualValue.split(',').map(v => v.trim().toLowerCase())
  // Handle comma-separated filter values
  const filterValues = filterValue.split(',').map(v => v.trim().toLowerCase())

  switch (operator) {
    case 'equals':
    case 'is':
      // Check if any actual value matches any filter value
      return actualValues.some(av => filterValues.some(fv => av === fv || av.includes(fv)))
    case 'not_equals':
    case 'is_not':
      // None of the actual values should match any filter value
      return !actualValues.some(av => filterValues.some(fv => av === fv || av.includes(fv)))
    case 'is_any':
      // Check if ANY of the filter values match ANY actual value
      return filterValues.some(fv => actualValues.some(av => av === fv || av.includes(fv)))
    case 'is_not_any':
      // NONE of the filter values should match any actual value
      return !filterValues.some(fv => actualValues.some(av => av === fv || av.includes(fv)))
    case 'contains':
      return actualValues.some(av => filterValues.some(fv => av.includes(fv)))
    case 'not_contains':
      return !actualValues.some(av => filterValues.some(fv => av.includes(fv)))
    case 'starts_with':
      return actualValues.some(av => filterValues.some(fv => av.startsWith(fv)))
    case 'ends_with':
      return actualValues.some(av => filterValues.some(fv => av.endsWith(fv)))
    case 'is_empty':
      return actualValue === ''
    case 'is_not_empty':
      return actualValue !== ''
    case 'in':
      return actualValues.some(av => filterValues.includes(av))
    case 'not_in':
      return !actualValues.some(av => filterValues.includes(av))
    default:
      return actualValues.some(av => filterValues.some(fv => av === fv))
  }
}

// ============================================================================
// PACING DISTRIBUTION
// ============================================================================

/**
 * Distribute emails evenly across allowed days over the pacing period
 * @param emails - Array of emails to distribute
 * @param spreadOverDays - Number of days to spread enrollments over
 * @param allowedDays - Array of allowed day names (e.g., ['mon', 'tue', 'wed', 'thu', 'fri'])
 * @param sendTime - Time to send emails (e.g., '09:00')
 * @param timezone - Timezone for the send time
 * @returns Array of emails with adjusted scheduled_for dates
 */
function applyPacingDistribution(
  emails: any[],
  spreadOverDays: number,
  allowedDays: string[],
  sendTime: string,
  timezone: string
): any[] {
  // Map day names to JS day numbers (0=Sun, 1=Mon, etc.)
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  const allowedDayNumbers = allowedDays.map(d => dayMap[d.toLowerCase()])

  // Build list of valid send dates starting from today
  const validDates: Date[] = []
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)

  // Scan through enough days to find spreadOverDays valid dates
  // (we may need to scan more than spreadOverDays if some days are excluded)
  const maxDaysToScan = spreadOverDays * 2
  for (let i = 0; i < maxDaysToScan && validDates.length < spreadOverDays; i++) {
    const checkDate = new Date(startDate)
    checkDate.setDate(checkDate.getDate() + i)
    if (allowedDayNumbers.includes(checkDate.getDay())) {
      validDates.push(new Date(checkDate))
    }
  }

  // If no valid dates found (shouldn't happen), fall back to all days
  if (validDates.length === 0) {
    console.log(`[Pacing] No valid dates found for allowed days: ${allowedDays.join(', ')}. Falling back to all days.`)
    for (let i = 0; i < spreadOverDays; i++) {
      const checkDate = new Date(startDate)
      checkDate.setDate(checkDate.getDate() + i)
      validDates.push(checkDate)
    }
  }

  // Distribute emails evenly across valid dates
  const emailsPerDay = Math.ceil(emails.length / validDates.length)
  console.log(`[Pacing] Distributing ${emails.length} emails over ${validDates.length} valid days (~${emailsPerDay}/day)`)

  // Parse send time
  const [hours, minutes] = sendTime.split(':').map(Number)

  return emails.map((email, index) => {
    const dayIndex = Math.floor(index / emailsPerDay)
    const sendDate = new Date(validDates[Math.min(dayIndex, validDates.length - 1)])

    // Apply send time in the specified timezone
    const scheduledFor = getScheduledDateTimeUTC(sendDate, sendTime, timezone)

    return {
      ...email,
      scheduled_for: scheduledFor
    }
  })
}

/**
 * Move a date to the next allowed day if it falls on a non-allowed day
 * @param date - The date to check
 * @param allowedDays - Array of allowed day names (e.g., ['mon', 'tue', 'wed', 'thu', 'fri'])
 * @returns The original date if allowed, or the next allowed date
 */
function moveToNextAllowedDay(date: Date, allowedDays: string[]): Date {
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  const allowedDayNumbers = allowedDays.map(d => dayMap[d.toLowerCase()])

  // If current day is allowed, return as-is
  if (allowedDayNumbers.includes(date.getDay())) {
    return date
  }

  // Find the next allowed day (search up to 7 days)
  const adjustedDate = new Date(date)
  for (let i = 1; i <= 7; i++) {
    adjustedDate.setDate(adjustedDate.getDate() + 1)
    if (allowedDayNumbers.includes(adjustedDate.getDay())) {
      return adjustedDate
    }
  }

  // Should never reach here, but return original date if we do
  return date
}
