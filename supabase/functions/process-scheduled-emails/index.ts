// supabase/functions/process-scheduled-emails/index.ts
// Edge function to process scheduled emails with SendGrid integration
// Handles: daily refresh, 24-hour verification, email sending
// Should be invoked via cron job or webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  applyMergeFields,
  applyPacingDistribution,
  buildEmailFooter,
  buildEmailSchedule,
  enrollmentLimitReached,
  extractDateTriggerRules,
  fallbackValidation,
  filterAccountsByConfig,
  getFinalSendEmailNodeId,
  getScheduledDateTimeUTC,
  moveToNextAllowedDay,
} from './logic.ts'
import { beginJobRun, completeJobRun } from '../_shared/jobRuns.ts'

// Dynamic CORS: only allow known frontend origins
const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  Deno.env.get('FRONTEND_URL'),
  'https://app.isgmarketing.com',
].filter(Boolean) as string[]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
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

// Timeout guard: Supabase edge functions have a 60s limit
const FUNCTION_TIMEOUT_MS = 55000

// Per-phase budgets for the 'daily' action, all measured from the request's
// startTime. Each phase bails cleanly at its mark so the later phases (and the
// final job-run recording) always get to execute instead of the whole isolate
// being killed mid-run: refresh stops at 20s, verification at 30s, sending at
// 55s. Work left over is picked up by the next 5-minute cron cycle.
const REFRESH_BUDGET_MS = 20000

// Max time to spend on 24h verification per run. Verification can now trigger
// SendGrid validation calls, so this caps it and leaves budget for the send step.
const VERIFICATION_BUDGET_MS = 30000

// Emails whose scheduled_for is further in the past than this are cancelled at
// verification instead of sent - a renewal reminder delivered weeks late is
// worse than none.
const MISSED_SEND_GRACE_MS = 3 * 24 * 60 * 60 * 1000

// A row stuck in 'Processing' longer than this had its isolate killed mid-send;
// it is reset to Pending (or Failed once out of attempts) so it can't wedge
// forever.
const STALE_PROCESSING_MS = 15 * 60 * 1000

serve(async (req) => {
  // Handle CORS preflight - must return 200 with proper headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req)
    })
  }

  const startTime = Date.now()
  const isTimedOut = () => Date.now() - startTime > FUNCTION_TIMEOUT_MS
  let jobRunId: number | null = null

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

    // Record the run's start immediately: if the runtime kills this isolate
    // mid-run, the row stays behind with finished_at NULL - visible evidence
    // instead of a silently vanished run.
    jobRunId = await beginJobRun(supabaseClient, {
      jobName: 'process-scheduled-emails',
      action,
      startedAtMs: startTime,
    })

    const results = {
      action,
      automationId,
      verified: 0,
      cancelled: 0,
      sent: 0,
      failed: 0,
      refreshed: 0,
      newScheduled: 0,
      reconciled: 0,
      errors: [] as string[],
      hasMore: false,        // Indicates if there are more accounts to process
      nextOffset: 0          // Next offset for continuation
    }

    // Step 0: Daily refresh - find new qualifying accounts for active automations
    // If automationId is provided, only refresh that specific automation
    if (action === 'refresh' || action === 'daily' || action === 'activate') {
      const refreshResult = await runDailyRefresh(supabaseClient, automationId, accountOffset, startTime)
      results.refreshed = refreshResult.automationsProcessed
      results.newScheduled = refreshResult.totalAdded
      results.cancelled += refreshResult.totalRemoved
      results.errors.push(...refreshResult.errors)
      results.hasMore = refreshResult.hasMore
      results.nextOffset = refreshResult.nextOffset
    }

    // Step 1: Run 24-hour verification for automation emails
    if (action === 'process' || action === 'verify' || action === 'daily') {
      const verifyResult = await runVerification(supabaseClient, startTime)
      results.verified = verifyResult.verified
      results.cancelled += verifyResult.cancelled
      results.errors.push(...verifyResult.errors)
    }

    // Step 2: Process ready-to-send emails
    if (action === 'process' || action === 'send' || action === 'daily') {
      const sendResult = await processReadyEmails(supabaseClient, sendgridApiKey, scheduledEmailId, startTime)
      results.sent = sendResult.sent
      results.failed = sendResult.failed
      results.errors.push(...sendResult.errors)
    }

    // Daily reconciliation - cancel Pending rows whose account no longer
    // qualifies / is past enrollment limits. Its own once-a-day cron, NOT part
    // of 'daily' (which runs every 5 min). Correctness lives at the gates;
    // this is queue hygiene.
    if (action === 'reconcile') {
      const reconcileResult = await runReconciliation(supabaseClient, startTime)
      results.reconciled = reconcileResult.checked
      results.cancelled += reconcileResult.cancelled
      results.errors.push(...reconcileResult.errors)
    }

    // Persist the run outcome: cron invocations discard the HTTP response, so
    // this table is the only place failures become visible.
    await completeJobRun(supabaseClient, jobRunId, {
      jobName: 'process-scheduled-emails',
      action,
      startedAtMs: startTime,
      success: results.errors.length === 0,
      summary: {
        refreshed: results.refreshed,
        newScheduled: results.newScheduled,
        verified: results.verified,
        cancelled: results.cancelled,
        sent: results.sent,
        failed: results.failed,
        reconciled: results.reconciled,
        hasMore: results.hasMore,
      },
      errors: results.errors,
    })

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...results
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Edge function error:', error)
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await completeJobRun(supabaseClient, jobRunId, {
        jobName: 'process-scheduled-emails',
        startedAtMs: startTime,
        success: false,
        errors: [error.message],
      })
    } catch { /* recording is best-effort */ }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// DAILY REFRESH - Find new qualifying accounts
// ============================================================================

async function runDailyRefresh(
  supabase: any,
  specificAutomationId: string | null = null,
  accountOffset: number = 0,
  startTime: number = Date.now()
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
    // Stop before the runtime kills the isolate: leave the remaining
    // automations for the next 5-minute run so verify/send still execute and
    // the run gets recorded. Not pushed to errors - a budget bail is normal.
    if (Date.now() - startTime > REFRESH_BUDGET_MS) {
      console.warn(`[Refresh] Time budget reached after ${automationsProcessed} automation(s) - remaining deferred to next run`)
      hasMore = true
      nextOffset = accountOffset
      break
    }

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
        // Schedule regardless of validation status - emails are validated ~24h
        // before send (and again just-in-time at send). Only skip addresses
        // already known to be invalid.
        .or('email_validation_status.is.null,email_validation_status.neq.invalid')
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
          .select('account_id, policy_lob, expiration_date, effective_date, policy_status, policy_term, policy_class')
          .in('account_id', batchIds)
          .eq('policy_status', 'Active')

        if (batchError) {
          console.log(`[${automation.name}] Policies batch error:`, batchError.message)
        } else if (batchPolicies) {
          allPolicies = allPolicies.concat(batchPolicies)
        }
      }

      const policies = allPolicies
      console.log(`[${automation.name}] Policies: ${policies?.length || 0} active for ${accountIds.length} accounts`)

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
      const { schedule: emailSchedule, skipped: skippedEmailSteps } = buildEmailSchedule(nodes, templateIdMap)

      // Surface any email steps dropped because their template doesn't exist
      // for this user - otherwise the step silently never sends.
      if (skippedEmailSteps.length > 0) {
        const skipMsg = `[${automation.name}] ${skippedEmailSteps.length} email step(s) skipped — ${skippedEmailSteps.map((s) => s.reason).join('; ')}`
        console.warn(skipMsg)
        errors.push(skipMsg)
      }

      console.log(`[${automation.name}] ${accounts?.length || 0} accounts, ${emailSchedule.length} email step(s)`)

      // Fetch template details for admin review
      const templateIds = [...new Set(emailSchedule.map(e => e.templateId).filter(Boolean))]
      if (templateIds.length === 0) {
        // No valid templates found, skip this automation. The most common cause
        // is a master template that was never synced to this user's
        // email_templates, so its templateKey resolves to nothing. Persist the
        // reason on the automation so it is visible in the UI rather than only
        // living in this response payload.
        const unresolved = templateKeys.filter((k) => !templateIdMap[k])
        const reason = unresolved.length > 0
          ? `No emails scheduled — template(s) not found for this user: ${unresolved.join(', ')}. Sync the master template to users, then re-activate.`
          : `No emails scheduled — automation has no usable email template. Check the send_email steps.`
        console.warn(`[${automation.name}] ${reason}`)
        errors.push(`${automation.name}: ${reason}`)
        await supabase
          .from('automations')
          .update({ last_error: reason, updated_at: new Date().toISOString() })
          .eq('id', automation.id)
        continue
      }

      // Templates resolved — clear any stale scheduling error from a prior run
      // (e.g. the template has since been synced to this user).
      if (automation.last_error) {
        await supabase
          .from('automations')
          .update({ last_error: null, updated_at: new Date().toISOString() })
          .eq('id', automation.id)
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

      // If the filter uses last_email_sent, build account -> most-recent-send map.
      // Scope is THIS automation only: an account that this automation has never
      // emailed has no entry and qualifies as "more than N days ago".
      const usesLastEmailSent = (filterConfig?.groups || []).some((g: any) =>
        (g.rules || []).some((r: any) => r.field === 'last_email_sent'))
      const lastSentByAccount: Record<string, string> = {}
      if (usesLastEmailSent) {
        const { data: sentRows } = await supabase
          .from('scheduled_emails')
          .select('account_id, updated_at')
          .eq('automation_id', automation.id)
          .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
        for (const row of sentRows || []) {
          const prev = lastSentByAccount[row.account_id]
          if (!prev || row.updated_at > prev) lastSentByAccount[row.account_id] = row.updated_at
        }
        console.log(`[${automation.name}] last_email_sent map: ${Object.keys(lastSentByAccount).length} account(s) previously emailed by this automation`)
      }

      // policy_status filter needs ALL statuses; the main policies query above is
      // Active-only (to keep active_policy_type / date triggers correct), so fetch
      // the distinct statuses per account separately when the filter uses it.
      const usesPolicyStatus = (filterConfig?.groups || []).some((g: any) =>
        (g.rules || []).some((r: any) => r.field === 'policy_status'))
      const policyStatusByAccount: Record<string, string[]> = {}
      if (usesPolicyStatus) {
        for (let i = 0; i < accountIds.length; i += POLICY_BATCH_SIZE) {
          const batchIds = accountIds.slice(i, i + POLICY_BATCH_SIZE)
          const { data: rows } = await supabase
            .from('policies')
            .select('account_id, policy_status')
            .in('account_id', batchIds)
          for (const r of rows || []) {
            const s = (r.policy_status || '').toLowerCase()
            if (!s) continue
            if (!policyStatusByAccount[r.account_id]) policyStatusByAccount[r.account_id] = []
            if (!policyStatusByAccount[r.account_id].includes(s)) policyStatusByAccount[r.account_id].push(s)
          }
        }
      }

      // Enrollment-limit history, keyed `${account_id}:${template_id}` -> { count, lastSent },
      // scoped to this automation. Lets us skip SCHEDULING a row that would exceed
      // max_enrollments / fall inside the cooldown, rather than creating it and
      // cancelling it later at the verify/send gate (which churns the queue).
      const capsEnrollments = (automation.max_enrollments != null && Number(automation.max_enrollments) > 0)
        || (Number(automation.enrollment_cooldown_days) || 0) > 0
      const enrollmentHistory: Record<string, { count: number, lastSent: string | null }> = {}
      if (capsEnrollments) {
        for (let i = 0; i < accountIds.length; i += POLICY_BATCH_SIZE) {
          const batchIds = accountIds.slice(i, i + POLICY_BATCH_SIZE)
          const { data: rows } = await supabase
            .from('email_logs')
            .select('account_id, template_id, sent_at')
            .eq('automation_id', automation.id)
            .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
            .in('account_id', batchIds)
          for (const r of rows || []) {
            const key = `${r.account_id}:${r.template_id}`
            const e = enrollmentHistory[key] || { count: 0, lastSent: null }
            e.count += 1
            if (r.sent_at && (!e.lastSent || r.sent_at > e.lastSent)) e.lastSent = r.sent_at
            enrollmentHistory[key] = e
          }
        }
      }

      // Filter accounts based on non-date filter rules (policy type, etc.)
      const filteredAccounts = filterAccountsByConfig(accounts, policies || [], filterConfig, lastSentByAccount, policyStatusByAccount)
      console.log(`[${automation.name}] Filtered accounts: ${filteredAccounts?.length || 0}, date trigger rules: ${dateTriggerRules?.length || 0}`)

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

            // Don't re-enroll past the automation's limits (max_enrollments / cooldown).
            if (capsEnrollments) {
              const hist = enrollmentHistory[`${account.account_unique_id}:${emailStep.templateId}`]
              if (hist && enrollmentLimitReached(hist.count, hist.lastSent, automation).limited) continue
            }

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
              // Re-qualify ~24h before send like date-based emails do. Non-date
              // automations re-enroll matching accounts every daily run, so without
              // this they bypass the 24h gate entirely and the only guard is the
              // 7-day template dedup — which lets a repeat through once that window
              // lapses (and never enforces max_enrollments / cooldown).
              requires_verification: true,
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

                // Don't re-enroll past the automation's limits (max_enrollments / cooldown).
                if (capsEnrollments) {
                  const hist = enrollmentHistory[`${account.account_unique_id}:${emailStep.templateId}`]
                  if (hist && enrollmentLimitReached(hist.count, hist.lastSent, automation).limited) continue
                }

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

      console.log(`[${automation.name}] New emails to insert: ${newEmails.length}`)

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
      console.log(`[${automation.name}] Inserting ${finalEmails.length} emails in batches of ${BATCH_SIZE}`)
      for (let i = 0; i < finalEmails.length; i += BATCH_SIZE) {
        const batch = finalEmails.slice(i, i + BATCH_SIZE)
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

async function runVerification(supabase: any, startTime: number): Promise<{ verified: number, cancelled: number, errors: string[] }> {
  const errors: string[] = []
  let verified = 0
  let cancelled = 0

  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Get emails needing verification: scheduled within the next 24 hours OR
  // already overdue. Overdue rows used to be excluded here, which made a
  // Pending row that missed its window while still requires_verification=true
  // permanently unsendable - never verified, never sent, never cancelled.
  // Oldest first so the backlog drains; rows past the grace window are
  // cancelled below instead of verified.
  const { data: emails, error } = await supabase
    .from('scheduled_emails')
    .select(`
      *,
      account:accounts(*),
      automation:automations(id, name, status, filter_config, max_enrollments, enrollment_cooldown_days)
    `)
    .eq('status', 'Pending')
    .eq('requires_verification', true)
    .lte('scheduled_for', in24Hours.toISOString())
    .order('scheduled_for')
    .limit(100)

  if (error) {
    errors.push(`Failed to get emails for verification: ${error.message}`)
    return { verified, cancelled, errors }
  }

  for (const email of (emails || [])) {
    // Verification can trigger SendGrid validation calls; stop before the
    // function times out. Unprocessed emails keep requires_verification=true
    // and are retried on the next run.
    if (Date.now() - startTime > VERIFICATION_BUDGET_MS) {
      console.warn(`[Verification] Time budget reached after ${verified + cancelled} emails - remaining will be retried next run`)
      break
    }

    try {
      // Too far past its send time: cancel rather than deliver weeks late.
      if (new Date(email.scheduled_for).getTime() < now.getTime() - MISSED_SEND_GRACE_MS) {
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'Cancelled',
            error_message: `Missed send window (scheduled for ${email.scheduled_for}, more than ${MISSED_SEND_GRACE_MS / 86400000} days ago)`,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)
        cancelled++
        continue
      }

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

  // Check if email address is present
  const recipientEmail = email.to_email || account.person_email || account.email
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { qualifies: false, reason: 'Invalid or missing email address' }
  }

  // Validate the email ~24h before send - this is the primary validation gate.
  // Addresses already known to be invalid/risky are dropped. Unknown or stale
  // (>90 day) addresses are validated now; only a bad result blocks the send.
  if (account.email_validation_status === 'invalid' || account.email_validation_status === 'risky') {
    const reason = account.email_validation_reason
    return {
      qualifies: false,
      reason: `Email validation status is '${account.email_validation_status}'${reason ? ` (${reason})` : ''}`
    }
  }

  const validatedAt = account.email_validated_at ? new Date(account.email_validated_at) : null
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  if (account.email_validation_status !== 'valid' || !validatedAt || validatedAt < ninetyDaysAgo) {
    const jitResult = await performJITValidation(supabase, email.account_id, recipientEmail)
    if (jitResult.status !== 'valid') {
      return {
        qualifies: false,
        reason: `Email validation failed: '${jitResult.status}'${jitResult.reason ? ` (${jitResult.reason})` : ''}`
      }
    }
    account.email_validation_status = 'valid'
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

  // Check suppression list (bounced or spam-reported emails)
  const { data: suppressed } = await supabase
    .from('email_suppressions')
    .select('id')
    .ilike('email', recipientEmail.trim())
    .limit(1)

  if (suppressed && suppressed.length > 0) {
    return { qualifies: false, reason: 'Email is on suppression list (previous bounce or spam report)' }
  }

  // Re-evaluate the FULL automation audience filter against CURRENT data.
  // Schedule-time qualification is a point-in-time snapshot; an account can
  // gain or lose a policy between scheduling and sending (e.g. a Salesforce
  // sync adds the auto policy a minute after the cross-sell was scheduled).
  // Re-running filter_config here re-applies every rule — including exclusions
  // like "active_policy_type is_not Personal Auto" — so an account that no
  // longer belongs in the segment is cancelled instead of mailed.
  if (automation?.filter_config) {
    const filterResult = await accountMatchesFilterConfig(supabase, account, automation, email)
    if (!filterResult.matches) {
      return { qualifies: false, reason: filterResult.reason }
    }
  }

  // The full re-eval above skips date-window rules (the scheduler owns those),
  // so for policy-date triggers still confirm the specific policy that fired
  // this schedule is present and active.
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

  // Enforce the automation's enrollment limits (max_enrollments / cooldown).
  // automation_enrollments is not populated, so this is derived from actual
  // send history. This is the real cap behind a single-shot automation
  // (max_enrollments=1) — the 7-day template dedup below is only a rolling
  // window and lets a repeat through once it lapses.
  const enrollment = await withinEnrollmentLimits(supabase, email, automation)
  if (!enrollment.ok) {
    return { qualifies: false, reason: enrollment.reason }
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

/**
 * Re-run an automation's filter_config against an account's CURRENT policies.
 * Mirrors the data prep in runDailyRefresh (Active-only policy snapshot, plus
 * the all-status / last-sent maps when the filter needs them) and reuses the
 * same filterAccountsByConfig evaluator the scheduler uses, so qualification
 * is identical at schedule time and re-eval time.
 */
async function accountMatchesFilterConfig(
  supabase: any,
  account: any,
  automation: any,
  email: ScheduledEmail
): Promise<{ matches: boolean, reason?: string }> {
  const filterConfig = automation?.filter_config || { groups: [] }
  const groups = filterConfig.groups || []
  if (groups.length === 0) return { matches: true }

  const accountId = account?.account_unique_id || email.account_id

  // Active policies only — matches the scheduler's snapshot (line ~286).
  const { data: policies } = await supabase
    .from('policies')
    .select('account_id, policy_lob, expiration_date, effective_date, policy_status, policy_term, policy_class')
    .eq('account_id', accountId)
    .eq('policy_status', 'Active')

  // policy_status rules need ALL statuses, not just Active.
  const usesPolicyStatus = groups.some((g: any) => (g.rules || []).some((r: any) => r.field === 'policy_status'))
  const policyStatusByAccount: Record<string, string[]> = {}
  if (usesPolicyStatus) {
    const { data: rows } = await supabase
      .from('policies')
      .select('policy_status')
      .eq('account_id', accountId)
    const set: string[] = []
    for (const r of rows || []) {
      const s = (r.policy_status || '').toLowerCase()
      if (s && !set.includes(s)) set.push(s)
    }
    policyStatusByAccount[accountId] = set
  }

  // last_email_sent rules need this automation's most recent send to the account.
  const usesLastEmailSent = groups.some((g: any) => (g.rules || []).some((r: any) => r.field === 'last_email_sent'))
  const lastSentByAccount: Record<string, string> = {}
  if (usesLastEmailSent) {
    const { data: sentRows } = await supabase
      .from('scheduled_emails')
      .select('updated_at')
      .eq('automation_id', automation.id)
      .eq('account_id', accountId)
      .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
      .order('updated_at', { ascending: false })
      .limit(1)
    if (sentRows && sentRows.length > 0) lastSentByAccount[accountId] = sentRows[0].updated_at
  }

  const matched = filterAccountsByConfig([account], policies || [], filterConfig, lastSentByAccount, policyStatusByAccount)
  if (matched.length > 0) return { matches: true }
  return { matches: false, reason: 'Account no longer matches the automation filter criteria' }
}

/**
 * Enforce max_enrollments / enrollment_cooldown_days from real send history.
 * email_logs remains the source of truth for limit checks (it predates
 * enrollment tracking, so it covers all historical sends); prior successful
 * sends of this template by this automation to this account stand in for
 * prior enrollments. Per-template counting reflects enrollments correctly for
 * the journeys here: each step uses a distinct template, sent once per
 * enrollment. automation_enrollments is populated at send time (see
 * recordEnrollmentSend) for reporting/journey state.
 */
async function withinEnrollmentLimits(
  supabase: any,
  email: ScheduledEmail,
  automation: any
): Promise<{ ok: boolean, reason?: string }> {
  const maxEnroll = automation?.max_enrollments
  const cooldownDays = Number(automation?.enrollment_cooldown_days) || 0
  const hasMax = maxEnroll !== null && maxEnroll !== undefined && Number(maxEnroll) > 0
  if (!hasMax && cooldownDays <= 0) return { ok: true }
  if (!email.template_id) return { ok: true }

  const { data: priorSends } = await supabase
    .from('email_logs')
    .select('sent_at')
    .eq('automation_id', email.automation_id)
    .eq('account_id', email.account_id)
    .eq('template_id', email.template_id)
    .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
    .order('sent_at', { ascending: false })

  const sends = priorSends || []
  const result = enrollmentLimitReached(sends.length, sends.length > 0 ? sends[0].sent_at : null, automation)
  return result.limited ? { ok: false, reason: result.reason } : { ok: true }
}

// ============================================================================
// ENROLLMENT TRACKING
// ============================================================================

/**
 * Record a successful automation send against automation_enrollments /
 * enrollment_history. The first email of a journey creates an Active
 * enrollment; each send increments emails_sent and advances current_node_id;
 * the journey's final send_email node marks the enrollment Completed.
 * Best-effort: any failure here is logged and swallowed — the email has
 * already gone out and limit checks read email_logs, not this table.
 */
async function recordEnrollmentSend(supabase: any, email: ScheduledEmail, emailLogId: number): Promise<void> {
  if (!email.automation_id || !email.account_id) return

  try {
    const nowIso = new Date().toISOString()

    // Find the account's Active enrollment in this automation, if any.
    const { data: existing } = await supabase
      .from('automation_enrollments')
      .select('id, emails_sent')
      .eq('automation_id', email.automation_id)
      .eq('account_id', email.account_id)
      .eq('status', 'Active')
      .order('enrolled_at', { ascending: false })
      .limit(1)

    let enrollmentId: number | null = null

    if (existing && existing.length > 0) {
      enrollmentId = existing[0].id
      await supabase
        .from('automation_enrollments')
        .update({
          emails_sent: (existing[0].emails_sent || 0) + 1,
          last_action_at: nowIso,
          current_node_id: (email as any).node_id || null,
          updated_at: nowIso
        })
        .eq('id', enrollmentId)
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('automation_enrollments')
        .insert({
          automation_id: email.automation_id,
          account_id: email.account_id,
          status: 'Active',
          enrolled_at: nowIso,
          last_action_at: nowIso,
          current_node_id: (email as any).node_id || null,
          emails_sent: 1
        })
        .select('id')
        .single()

      if (insertError) {
        // Unique-active index race: another instance created it. Re-read and
        // fall through without incrementing twice for this send.
        const { data: raced } = await supabase
          .from('automation_enrollments')
          .select('id')
          .eq('automation_id', email.automation_id)
          .eq('account_id', email.account_id)
          .eq('status', 'Active')
          .limit(1)
        enrollmentId = raced && raced.length > 0 ? raced[0].id : null
      } else {
        enrollmentId = inserted?.id ?? null
      }
    }

    if (!enrollmentId) return

    await supabase
      .from('enrollment_history')
      .insert({
        enrollment_id: enrollmentId,
        node_id: (email as any).node_id || 'send_email',
        node_type: 'send_email',
        action: 'completed',
        email_log_id: emailLogId,
        completed_at: nowIso
      })

    // Journey finished? The last send_email node completes the enrollment.
    const finalNodeId = getFinalSendEmailNodeId(email.automation?.nodes || [])
    if (finalNodeId && (email as any).node_id === finalNodeId) {
      await supabase
        .from('automation_enrollments')
        .update({ status: 'Completed', completed_at: nowIso, updated_at: nowIso })
        .eq('id', enrollmentId)
    }
  } catch (err: any) {
    console.warn(`[Enrollment] Failed to record send for email ${email.id}: ${err.message}`)
  }
}

// ============================================================================
// DAILY RECONCILIATION - cancel Pending rows that no longer qualify
// ============================================================================

/**
 * Once-a-day sweep over the Pending queue. Re-evaluates each pending automation
 * email against CURRENT data and cancels it if the account no longer matches the
 * automation's filter_config, the automation is paused/deleted, or the account
 * is past the automation's enrollment limits. Correctness is already guaranteed
 * at the verify/send gates; this keeps the queue (and reporting) honest and
 * removes de-qualified rows long before their send date. Runs on its own daily
 * cron, NOT folded into the every-5-min 'daily' action.
 */
async function runReconciliation(
  supabase: any,
  startTime: number
): Promise<{ checked: number, cancelled: number, errors: string[] }> {
  const errors: string[] = []
  let checked = 0
  let cancelled = 0
  const BATCH = 100

  const { data: pendingRows, error } = await supabase
    .from('scheduled_emails')
    .select('id, account_id, automation_id, template_id')
    .eq('status', 'Pending')
    .not('automation_id', 'is', null)
    .order('automation_id')

  if (error) {
    errors.push(`Reconcile: failed to load pending emails: ${error.message}`)
    return { checked, cancelled, errors }
  }

  // Group pending rows by automation so we evaluate each automation once.
  const byAutomation: Record<string, any[]> = {}
  for (const r of pendingRows || []) {
    if (!byAutomation[r.automation_id]) byAutomation[r.automation_id] = []
    byAutomation[r.automation_id].push(r)
  }

  const cancelBatch = async (ids: string[], reason: string) => {
    for (let i = 0; i < ids.length; i += BATCH) {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'Cancelled', error_message: `Reconcile: ${reason}`, updated_at: new Date().toISOString() })
        .in('id', ids.slice(i, i + BATCH))
        .eq('status', 'Pending')
    }
  }

  for (const [automationId, rows] of Object.entries(byAutomation)) {
    if (Date.now() - startTime > VERIFICATION_BUDGET_MS) {
      console.warn(`[Reconcile] Time budget reached after ${checked} rows - remaining automations retried next run`)
      break
    }

    try {
      const { data: automation } = await supabase
        .from('automations')
        .select('id, name, status, filter_config, max_enrollments, enrollment_cooldown_days')
        .eq('id', automationId)
        .single()

      checked += rows.length

      if (!automation) {
        await cancelBatch(rows.map((r: any) => r.id), 'Automation no longer exists')
        cancelled += rows.length
        continue
      }
      if (automation.status !== 'Active' && automation.status !== 'active') {
        await cancelBatch(rows.map((r: any) => r.id), 'Automation is not active')
        cancelled += rows.length
        continue
      }

      const accountIds = [...new Set(rows.map((r: any) => r.account_id))]

      // Fetch accounts + Active policies (mirrors runDailyRefresh's snapshot).
      const accounts: any[] = []
      for (let i = 0; i < accountIds.length; i += BATCH) {
        const { data } = await supabase
          .from('accounts')
          .select('*')
          .in('account_unique_id', accountIds.slice(i, i + BATCH))
        if (data) accounts.push(...data)
      }
      const policies: any[] = []
      for (let i = 0; i < accountIds.length; i += BATCH) {
        const { data } = await supabase
          .from('policies')
          .select('account_id, policy_lob, expiration_date, effective_date, policy_status, policy_term, policy_class')
          .in('account_id', accountIds.slice(i, i + BATCH))
          .eq('policy_status', 'Active')
        if (data) policies.push(...data)
      }

      const filterConfig = automation.filter_config || { groups: [] }
      const groups = filterConfig.groups || []

      // policy_status rules need ALL statuses, not just Active.
      const policyStatusByAccount: Record<string, string[]> = {}
      if (groups.some((g: any) => (g.rules || []).some((r: any) => r.field === 'policy_status'))) {
        for (let i = 0; i < accountIds.length; i += BATCH) {
          const { data } = await supabase
            .from('policies')
            .select('account_id, policy_status')
            .in('account_id', accountIds.slice(i, i + BATCH))
          for (const r of data || []) {
            const s = (r.policy_status || '').toLowerCase()
            if (!s) continue
            if (!policyStatusByAccount[r.account_id]) policyStatusByAccount[r.account_id] = []
            if (!policyStatusByAccount[r.account_id].includes(s)) policyStatusByAccount[r.account_id].push(s)
          }
        }
      }
      // last_email_sent rules need this automation's most recent send per account.
      const lastSentByAccount: Record<string, string> = {}
      if (groups.some((g: any) => (g.rules || []).some((r: any) => r.field === 'last_email_sent'))) {
        const { data } = await supabase
          .from('scheduled_emails')
          .select('account_id, updated_at')
          .eq('automation_id', automation.id)
          .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
        for (const r of data || []) {
          const prev = lastSentByAccount[r.account_id]
          if (!prev || r.updated_at > prev) lastSentByAccount[r.account_id] = r.updated_at
        }
      }

      const matched = filterAccountsByConfig(accounts, policies, filterConfig, lastSentByAccount, policyStatusByAccount)
      const matchedIds = new Set(matched.map((a: any) => a.account_unique_id))

      // Enrollment history for limit checks (per account:template).
      const capsEnrollments = (automation.max_enrollments != null && Number(automation.max_enrollments) > 0)
        || (Number(automation.enrollment_cooldown_days) || 0) > 0
      const enrollmentHistory: Record<string, { count: number, lastSent: string | null }> = {}
      if (capsEnrollments) {
        for (let i = 0; i < accountIds.length; i += BATCH) {
          const { data } = await supabase
            .from('email_logs')
            .select('account_id, template_id, sent_at')
            .eq('automation_id', automation.id)
            .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
            .in('account_id', accountIds.slice(i, i + BATCH))
          for (const r of data || []) {
            const key = `${r.account_id}:${r.template_id}`
            const e = enrollmentHistory[key] || { count: 0, lastSent: null }
            e.count += 1
            if (r.sent_at && (!e.lastSent || r.sent_at > e.lastSent)) e.lastSent = r.sent_at
            enrollmentHistory[key] = e
          }
        }
      }

      // Decide per row; batch the cancels by reason.
      const cancelByReason: Record<string, string[]> = {}
      for (const row of rows) {
        let reason: string | null = null
        if (!matchedIds.has(row.account_id)) {
          reason = 'Account no longer matches the automation filter criteria'
        } else if (capsEnrollments) {
          const hist = enrollmentHistory[`${row.account_id}:${row.template_id}`]
          const limit = enrollmentLimitReached(hist?.count || 0, hist?.lastSent || null, automation)
          if (limit.limited) reason = limit.reason || 'Past enrollment limits'
        }
        if (reason) {
          if (!cancelByReason[reason]) cancelByReason[reason] = []
          cancelByReason[reason].push(row.id)
        }
      }
      for (const [reason, ids] of Object.entries(cancelByReason)) {
        await cancelBatch(ids, reason)
        cancelled += ids.length
      }
    } catch (err: any) {
      errors.push(`Reconcile automation ${automationId}: ${err.message}`)
    }
  }

  return { checked, cancelled, errors }
}

// ============================================================================
// PROCESS READY EMAILS - Send via SendGrid
// ============================================================================

async function processReadyEmails(
  supabase: any,
  sendgridApiKey: string | undefined,
  specificEmailId: string | null = null,
  startTime: number = Date.now()
): Promise<{ sent: number, failed: number, errors: string[] }> {
  const errors: string[] = []
  let sent = 0
  let failed = 0

  // Recover rows wedged in 'Processing' by a killed isolate: the atomic
  // Pending->Processing claim means a mid-send crash leaves the row claimed
  // forever (the send query only picks up Pending). Reset stale claims to
  // Pending for retry, or Failed once they're out of attempts.
  await recoverStaleProcessing(supabase, errors)

  // Build query for ready emails
  let query = supabase
    .from('scheduled_emails')
    .select(`
      *,
      account:accounts(*),
      template:email_templates(*),
      automation:automations(id, name, status, filter_config, max_enrollments, enrollment_cooldown_days, nodes)
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
    // Stop claiming new emails before the runtime kills the isolate - an
    // unclaimed Pending row is safely sent next cycle, but a claimed one
    // whose isolate dies is wedged until the stale-Processing sweep.
    if (Date.now() - startTime > FUNCTION_TIMEOUT_MS) {
      console.warn(`[Send] Time budget reached after ${sent + failed} email(s) - remaining Pending rows sent next run`)
      break
    }

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

        // Check suppression list (bounced or spam-reported emails)
        const { data: suppressed } = await supabase
          .from('email_suppressions')
          .select('id')
          .ilike('email', recipientEmail.trim())
          .limit(1)

        if (suppressed && suppressed.length > 0) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: 'Recipient is on suppression list (previous bounce or spam report)',
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
        // If not valid, attempt just-in-time validation before cancelling
        if (email.account?.email_validation_status !== 'valid') {
          const currentStatus = email.account?.email_validation_status || 'unknown'

          // Check if validation is expired (> 90 days old) or never done
          const validatedAt = email.account?.email_validated_at ? new Date(email.account.email_validated_at) : null
          const ninetyDaysAgo = new Date()
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
          const isExpired = !validatedAt || validatedAt < ninetyDaysAgo
          const needsJITValidation = currentStatus === 'unknown' || currentStatus === null || isExpired

          if (needsJITValidation && recipientEmail) {
            console.log(`[JIT Validation] Attempting validation for account ${email.account_id} (status: ${currentStatus}, expired: ${isExpired})`)

            // Perform just-in-time validation
            const jitResult = await performJITValidation(supabase, email.account_id, recipientEmail)

            if (jitResult.status === 'valid') {
              console.log(`[JIT Validation] Account ${email.account_id} validated successfully - proceeding with send`)
              // Update the local account object so we don't cancel
              email.account.email_validation_status = 'valid'
            } else {
              // JIT validation failed - cancel the email
              await supabase
                .from('scheduled_emails')
                .update({
                  status: 'Cancelled',
                  error_message: `JIT validation failed: ${jitResult.status}${jitResult.reason ? ` (${jitResult.reason})` : ''}`,
                  updated_at: new Date().toISOString()
                })
                .eq('id', email.id)
              console.log(`[JIT Validation] Account ${email.account_id} failed validation: ${jitResult.status}`)
              continue
            }
          } else if (currentStatus !== 'valid') {
            // Not eligible for JIT validation and not valid - cancel
            const reason = email.account?.email_validation_reason
            await supabase
              .from('scheduled_emails')
              .update({
                status: 'Cancelled',
                error_message: `Email validation status is '${currentStatus}'${reason ? ` (${reason})` : ''}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', email.id)
            continue
          }
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

      // Final enrollment-limit check (max_enrollments / cooldown). Catches rows
      // that skipped the 24h gate (e.g. requires_verification=false) so a
      // single-shot automation can never send twice even if the 7-day dedup
      // window has lapsed.
      const enrollment = await withinEnrollmentLimits(supabase, email, email.automation)
      if (!enrollment.ok) {
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'Cancelled',
            error_message: enrollment.reason,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)
        continue
      }

      // Final audience re-qualification at send time. The 24h gate already does
      // this, but only for rows it touches (requires_verification=true). Rows
      // verified earlier (now requires_verification=false) or otherwise bypassing
      // verification would not be re-checked — so re-run the full filter_config
      // here too. Closes the case where an account stopped matching the segment
      // (e.g. acquired the missing line) after it was verified.
      if (email.automation?.filter_config && email.account) {
        const filterResult = await accountMatchesFilterConfig(supabase, email.account, email.automation, email)
        if (!filterResult.matches) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: filterResult.reason,
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

        // Record the send against the account's enrollment (creates it on the
        // first email of a journey, completes it on the last). Best-effort:
        // enrollment bookkeeping must never fail a send that already happened.
        await recordEnrollmentSend(supabase, email, emailLog.id)

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

/**
 * Reset scheduled_emails rows stuck in 'Processing' (claimed by an isolate
 * that was killed mid-send). PostgREST can't compare two columns in a filter,
 * so fetch the stale rows and partition in JS: rows with attempts left go back
 * to Pending for retry; exhausted rows go to Failed. The email may or may not
 * have reached SendGrid before the crash - the 7-day template dedup at the
 * send gate protects retries from double-sending.
 */
async function recoverStaleProcessing(supabase: any, errors: string[]): Promise<void> {
  try {
    const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
    const { data: staleRows, error } = await supabase
      .from('scheduled_emails')
      .select('id, attempts, max_attempts')
      .eq('status', 'Processing')
      .lt('last_attempt_at', staleCutoff)
      .limit(200)

    if (error || !staleRows || staleRows.length === 0) return

    const retryIds: (string | number)[] = []
    const failIds: (string | number)[] = []
    for (const row of staleRows) {
      const maxAttempts = row.max_attempts || 3
      if ((row.attempts || 0) >= maxAttempts) failIds.push(row.id)
      else retryIds.push(row.id)
    }

    if (retryIds.length > 0) {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'Pending', updated_at: new Date().toISOString() })
        .in('id', retryIds)
        .eq('status', 'Processing')
    }
    if (failIds.length > 0) {
      await supabase
        .from('scheduled_emails')
        .update({
          status: 'Failed',
          error_message: 'Send was interrupted (function terminated mid-send) and retry attempts are exhausted',
          updated_at: new Date().toISOString()
        })
        .in('id', failIds)
        .eq('status', 'Processing')
    }
    console.warn(`[Send] Recovered ${staleRows.length} stale Processing row(s): ${retryIds.length} back to Pending, ${failIds.length} Failed`)
  } catch (err: any) {
    errors.push(`Stale-Processing recovery failed: ${err.message}`)
  }
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

  // Star-rating links point at the star-rating edge function
  const starRatingBaseUrl = Deno.env.get('SUPABASE_URL')
    ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/star-rating`
    : 'https://app.isgmarketing.com/api/star-rating'

  // Apply merge fields to template content (pass emailLogId for star rating URLs)
  const baseHtmlContent = applyMergeFields(template.body_html || '', email, account, emailLogId, starRatingBaseUrl)
  const textContent = applyMergeFields(template.body_text || '', email, account, emailLogId, starRatingBaseUrl)
  const finalSubject = applyMergeFields(subject || 'No Subject', email, account, emailLogId, starRatingBaseUrl)

  // Build email footer with signature, company info, and unsubscribe (use emailLogId for tracking)
  const rawAppUrl = Deno.env.get('APP_URL') || 'isgmarketing-production.up.railway.app'
  const appUrl = rawAppUrl.startsWith('http') ? rawAppUrl : `https://${rawAppUrl}`
  const emailFooter = buildEmailFooter(userSettings, email, emailLogId, appUrl)

  // Wrap in proper HTML document with UTF-8 charset for proper character encoding
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0;">
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
    <style>p { margin: 0 0 1em 0; } p:last-of-type { margin-bottom: 0; }</style>
    ${baseHtmlContent}
    ${emailFooter}
  </div>
</body>
</html>`.trim()

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
  // Use dedicated validation key if available, fall back to general SendGrid key
  const sendgridValidationKey = Deno.env.get('SENDGRID_VALIDATION_KEY') || Deno.env.get('SENDGRID_API_KEY')

  if (!sendgridValidationKey) {
    console.warn('[JIT Validation] No SendGrid validation key configured - using fallback validation')
    const fallbackResult = fallbackValidation(email)
    // Update account with fallback result
    await updateAccountValidation(supabase, accountId, fallbackResult)
    return { status: fallbackResult.status, reason: fallbackResult.reason }
  }

  // Basic format validation first
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
      body: JSON.stringify({
        email: email,
        source: 'isg_marketing_jit_validation'
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[JIT Validation] SendGrid API error ${response.status}: ${errorText}`)

      // Fall back to basic validation if API not accessible
      if (response.status === 403 || response.status === 401 || errorText.includes('not enabled')) {
        const fallbackResult = fallbackValidation(email)
        await updateAccountValidation(supabase, accountId, fallbackResult)
        return { status: fallbackResult.status, reason: fallbackResult.reason }
      }

      throw new Error(`SendGrid API error: ${response.status}`)
    }

    const data = await response.json()
    const result = data.result

    // Map SendGrid verdict to our status
    let status: 'valid' | 'risky' | 'invalid'
    switch (result.verdict) {
      case 'Valid': status = 'valid'; break
      case 'Risky': status = 'risky'; break
      default: status = 'invalid'
    }

    // Determine reason for risky/invalid
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

    // Update account with validation result
    const validationResult = { status, score: result.score, reason, details: result }
    await updateAccountValidation(supabase, accountId, validationResult)

    return { status, reason }

  } catch (err: any) {
    console.error(`[JIT Validation] Error validating account ${accountId}:`, err.message)
    // Fall back to basic validation on error
    const fallbackResult = fallbackValidation(email)
    await updateAccountValidation(supabase, accountId, fallbackResult)
    return { status: fallbackResult.status, reason: fallbackResult.reason }
  }
}

/**
 * Update account with validation result
 */
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
