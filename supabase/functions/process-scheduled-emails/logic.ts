// supabase/functions/process-scheduled-emails/logic.ts
//
// Pure decision logic for the scheduled-email engine: audience filtering,
// date-trigger extraction, schedule building, enrollment limits, timezone
// math, pacing, merge fields, and footer construction.
//
// This module MUST stay dependency-free (no Deno/Node APIs, no imports) so it
// can be exercised by both the Deno edge runtime (imported from index.ts) and
// the repo's Vitest suite (logic.test.ts).

export interface ScheduledEmailLike {
  id?: string | number
  owner_id?: string
  automation_id?: string | number | null
  account_id?: string
  template_id?: string | number
  to_email?: string
  to_name?: string
  qualification_value?: string | null
  [key: string]: any
}

// ============================================================================
// ENROLLMENT LIMITS
// ============================================================================

/**
 * Pure check: has an account hit an automation's enrollment limits?
 * sentCount = prior successful sends of the enrolling template; lastSentIso =
 * the most recent of those. Shared by the per-email gate (withinEnrollmentLimits)
 * and the batched schedule-time / reconciliation checks so they all agree.
 */
export function enrollmentLimitReached(
  sentCount: number,
  lastSentIso: string | null,
  automation: any,
  nowMs: number = Date.now()
): { limited: boolean, reason?: string } {
  const maxEnroll = automation?.max_enrollments
  const cooldownDays = Number(automation?.enrollment_cooldown_days) || 0
  const hasMax = maxEnroll !== null && maxEnroll !== undefined && Number(maxEnroll) > 0
  if (hasMax && sentCount >= Number(maxEnroll)) {
    return { limited: true, reason: `Max enrollments reached (${sentCount}/${maxEnroll}) for this automation` }
  }
  if (cooldownDays > 0 && lastSentIso) {
    const lastSentMs = new Date(lastSentIso).getTime()
    if (lastSentMs > nowMs - cooldownDays * 24 * 60 * 60 * 1000) {
      return { limited: true, reason: `Within ${cooldownDays}-day enrollment cooldown (last sent ${lastSentIso})` }
    }
  }
  return { limited: false }
}

// ============================================================================
// TIMEZONE HELPERS
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
export function getScheduledDateTimeUTC(date: Date, time: string, timezone: string): string {
  const [hours, minutes] = time.split(':').map(Number)

  // Get the timezone offset in hours (positive = behind UTC, e.g. Chicago = 6)
  const offsetHours = getTimezoneOffsetHours(timezone, date)

  // Create a UTC date by adding the offset to the local time
  // If it's 10:00 AM in Chicago (UTC-6), UTC time is 10:00 + 6 = 16:00.
  // Work in minutes: half-hour zones (e.g. UTC+5:30) produce fractional hours,
  // which Date.UTC would silently truncate.
  const offsetMinutes = Math.round(offsetHours * 60)

  const utcDate = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes + offsetMinutes,
    0,
    0
  ))

  return utcDate.toISOString()
}

/**
 * Get timezone offset in hours for a given timezone at a specific date.
 * Uses Intl.DateTimeFormat so ANY IANA timezone works and DST transitions
 * (including non-US rules and future rule changes) are handled by the runtime
 * instead of hand-rolled US-only tables.
 * Returns positive number for timezones behind UTC (e.g., 6 for Chicago in winter).
 */
export function getTimezoneOffsetHours(timezone: string, date: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
    const offsetPart = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || ''
    // offsetPart looks like "GMT-06:00", "GMT+05:30", or "GMT" for UTC
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return 0 // "GMT" with no offset = UTC
    const sign = match[1] === '-' ? 1 : -1 // behind UTC → positive, ahead → negative
    const hours = parseInt(match[2], 10)
    const mins = match[3] ? parseInt(match[3], 10) : 0
    return sign * (hours + mins / 60)
  } catch {
    // Unknown/invalid timezone string: fall back to CST (the app default)
    return isDateInUSDST(date) ? 5 : 6
  }
}

/**
 * Check if a date falls within US Daylight Saving Time.
 * Only used as a fallback when an invalid timezone string is supplied.
 * DST starts: Second Sunday in March at 2:00 AM
 * DST ends: First Sunday in November at 2:00 AM
 */
export function isDateInUSDST(date: Date): boolean {
  const year = date.getFullYear()
  const month = date.getMonth()

  if (month < 2 || month > 10) return false
  if (month > 2 && month < 10) return true

  if (month === 2) {
    const secondSunday = getSecondSundayOfMonth(year, 2)
    return date.getDate() >= secondSunday
  }
  if (month === 10) {
    const firstSunday = getFirstSundayOfMonth(year, 10)
    return date.getDate() < firstSunday
  }
  return false
}

export function getSecondSundayOfMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1).getDay()
  const daysUntilFirstSunday = firstDay === 0 ? 0 : 7 - firstDay
  return 1 + daysUntilFirstSunday + 7
}

export function getFirstSundayOfMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1).getDay()
  const daysUntilFirstSunday = firstDay === 0 ? 0 : 7 - firstDay
  return 1 + daysUntilFirstSunday
}

// ============================================================================
// DATE TRIGGER RULES
// ============================================================================

export function extractDateTriggerRules(filterConfig: any): any[] {
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

// ============================================================================
// EMAIL SCHEDULE FROM WORKFLOW NODES
// ============================================================================

export function buildEmailSchedule(nodes: any[], templateIdMap: Record<string, string> = {}): {
  schedule: { nodeId: string, templateId: string, daysOffset: number }[],
  skipped: { nodeId: string, reason: string }[]
} {
  const schedule: { nodeId: string, templateId: string, daysOffset: number }[] = []
  const skipped: { nodeId: string, reason: string }[] = []
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
      } else if (node.type === 'send_email') {
        // Template didn't resolve - record the dropped step so it's visible
        // instead of the email type silently never being scheduled.
        skipped.push({
          nodeId: node.id,
          reason: node.config?.templateKey
            ? `template not found for templateKey "${node.config.templateKey}"`
            : 'send_email node has no template or templateKey configured'
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

  const workflowNodes = (nodes || []).filter((n: any) => n.type !== 'entry_criteria' && n.type !== 'trigger')
  processNodes(workflowNodes)

  return { schedule, skipped }
}

/**
 * The node id of the LAST send_email step in traversal order, or null.
 * Used to mark an enrollment Completed once its final email goes out.
 */
export function getFinalSendEmailNodeId(nodes: any[]): string | null {
  let lastId: string | null = null
  const walk = (nodeList: any[]) => {
    for (const node of nodeList || []) {
      if (node.type === 'send_email') lastId = node.id
      if (node.branches?.yes) walk(node.branches.yes)
    }
  }
  walk((nodes || []).filter((n: any) => n.type !== 'entry_criteria' && n.type !== 'trigger'))
  return lastId
}

// ============================================================================
// AUDIENCE FILTERING
// ============================================================================

/**
 * Filter accounts based on non-date filter rules in the filter config
 * Handles filters like customer_status, policy_type, etc.
 */
export function filterAccountsByConfig(
  accounts: any[],
  policies: any[],
  filterConfig: any,
  lastSentByAccount: Record<string, string> = {},
  policyStatusByAccount: Record<string, string[]> = {}
): any[] {
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
          case 'account_status': {
            const accountStatus = (account.customer_status || account.account_status || '').toLowerCase()
            return matchValue(accountStatus, value, rule.operator)
          }

          case 'active_policy_type':
          case 'policy_type': {
            // Get all policy types for this account
            const policyTypes = accountPolicies.map((p: any) => (p.policy_lob || '').toLowerCase()).join(',')

            // For negative operators, if no policies exist, consider it a match
            if (accountPolicies.length === 0) {
              return ['is_not', 'is_not_any', 'not_equals', 'not_in'].includes(rule.operator)
            }

            return matchValue(policyTypes, value, rule.operator)
          }

          case 'policy_term':
            // Check if account has a policy with the specified term
            return accountPolicies.some((p: any) => {
              const policyTerm = (p.policy_term || '').toLowerCase()
              return matchValue(policyTerm, value, rule.operator)
            })

          case 'state':
          case 'billing_state': {
            const state = (account.billing_state || account.state || '').toLowerCase()
            return matchValue(state, value, rule.operator)
          }

          case 'city':
          case 'billing_city': {
            const city = (account.billing_city || account.city || '').toLowerCase()
            return matchValue(city, value, rule.operator)
          }

          case 'has_email': {
            const hasEmail = !!(account.person_email || account.email)
            return rule.operator === 'equals' ? hasEmail === (value === 'true') : hasEmail !== (value === 'true')
          }

          case 'survey_stars': {
            const surveyStars = account.survey_stars?.toString() || ''
            if (!surveyStars && rule.operator === 'is_not') return true
            if (!surveyStars) return false
            return matchValue(surveyStars, value, rule.operator)
          }

          case 'survey_completed': {
            const hasSurvey = account.survey_stars !== null && account.survey_stars !== undefined
            const wantsSurvey = value === 'true'
            return rule.operator === 'is' ? hasSurvey === wantsSurvey : hasSurvey !== wantsSurvey
          }

          case 'last_email_sent': {
            // Date this automation last emailed the account (scope: this automation).
            // Never-emailed accounts have no entry → treated as "infinitely long ago".
            const lastSent = lastSentByAccount[account.account_unique_id]
            if (!lastSent) {
              return ['more_than_days_ago', 'before', 'is_empty'].includes(rule.operator)
            }
            return matchDate(lastSent, rule)
          }

          case 'policy_status': {
            // Distinct statuses across ALL of the account's policies.
            const statuses = policyStatusByAccount[account.account_unique_id] || []
            if (statuses.length === 0) {
              return ['is_not', 'is_not_any', 'not_equals', 'not_in'].includes(rule.operator)
            }
            return matchValue(statuses.join(','), value, rule.operator)
          }

          case 'policy_class': {
            // Personal / Commercial across the account's active policies.
            const classes = accountPolicies.map((p: any) => (p.policy_class || '').toLowerCase()).filter(Boolean)
            if (classes.length === 0) {
              return ['is_not', 'is_not_any', 'not_equals', 'not_in'].includes(rule.operator)
            }
            return matchValue(classes.join(','), value, rule.operator)
          }

          case 'policy_count': {
            // Number of active policies on the account.
            return matchNumber(accountPolicies.length, rule)
          }

          case 'email_domain': {
            const em = (account.person_email || account.email || '').toLowerCase()
            const domain = em.includes('@') ? em.split('@').pop() || '' : ''
            return matchValue(domain, value, rule.operator)
          }

          case 'zip_code': {
            const zip = (account.billing_postal_code || account.zip_code || '').toString().toLowerCase()
            return matchValue(zip, value, rule.operator)
          }

          case 'account_created':
            // Date-trigger operators (in_next_days, etc.) are skipped above and
            // handled by the scheduling engine; the rest are base-filter dates.
            return matchDate(account.created_at, rule)

          case 'policy_effective':
          case 'policy_expiration': {
            const dateField = rule.field === 'policy_expiration' ? 'expiration_date' : 'effective_date'
            // Match if ANY active policy's date satisfies the rule.
            return accountPolicies.some((p: any) => matchDate(p[dateField], rule))
          }

          default: {
            // For unknown fields, try to match against account properties
            const fieldValue = (account[rule.field] || '').toString().toLowerCase()
            return matchValue(fieldValue, value, rule.operator)
          }
        }
      })
    })
  })
}

/**
 * Match a value against a filter value based on operator
 * For policy type checks, actualValue may be comma-separated list of policy types
 */
export function matchValue(actualValue: string, filterValue: string, operator: string): boolean {
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

/**
 * Numeric comparison for number fields (e.g. policy_count).
 * 'between' uses rule.value (low) and rule.value2 (high).
 */
export function matchNumber(actual: number, rule: any): boolean {
  const a = Number(rule.value)
  if (isNaN(a)) return false
  switch (rule.operator) {
    case 'equals': return actual === a
    case 'greater_than': return actual > a
    case 'less_than': return actual < a
    case 'at_least': return actual >= a
    case 'at_most': return actual <= a
    case 'between': {
      const b = Number(rule.value2)
      if (isNaN(b)) return false
      return actual >= Math.min(a, b) && actual <= Math.max(a, b)
    }
    default: return false
  }
}

/**
 * Date comparison for date fields used as base filters. Handles absolute-date
 * operators (before/after/between) and relative day-offset operators. The
 * date-trigger operators (in_next_days, in_last_days, more/less_than_days_future)
 * on policy and account_created fields are intercepted earlier for the scheduling
 * engine, but are implemented here too so date fields that aren't scheduling
 * triggers (e.g. last_email_sent) behave correctly.
 */
export function matchDate(dateValue: any, rule: any, nowMs: number = Date.now()): boolean {
  if (rule.operator === 'is_empty') return !dateValue
  if (rule.operator === 'is_not_empty') return !!dateValue
  if (!dateValue) return false
  const t = new Date(dateValue).getTime()
  if (isNaN(t)) return false
  const dayMs = 1000 * 60 * 60 * 24

  // Absolute-date operators
  if (rule.operator === 'before') return t < new Date(rule.value).getTime()
  if (rule.operator === 'after') return t > new Date(rule.value).getTime()
  if (rule.operator === 'between') {
    const lo = new Date(rule.value).getTime()
    const hi = new Date(rule.value2).getTime()
    if (isNaN(lo) || isNaN(hi)) return false
    return t >= Math.min(lo, hi) && t <= Math.max(lo, hi)
  }

  // Relative day-offset operators (positive diffDays = future, negative = past)
  const days = parseInt(rule.value, 10)
  if (isNaN(days)) return false
  const diffDays = (t - nowMs) / dayMs
  switch (rule.operator) {
    case 'more_than_days_ago': return diffDays < -days
    case 'less_than_days_ago': return diffDays < 0 && diffDays > -days
    case 'exactly_days_ago': return Math.floor(-diffDays) === days
    case 'more_than_days_future': return diffDays > days
    case 'less_than_days_future': return diffDays > 0 && diffDays < days
    case 'exactly_days_future': return Math.floor(diffDays) === days
    case 'in_next_days': return diffDays >= 0 && diffDays <= days
    case 'in_last_days': return diffDays <= 0 && diffDays >= -days
    default: return false
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
export function applyPacingDistribution(
  emails: any[],
  spreadOverDays: number,
  allowedDays: string[],
  sendTime: string,
  timezone: string,
  startFrom: Date = new Date()
): any[] {
  // Map day names to JS day numbers (0=Sun, 1=Mon, etc.)
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  const allowedDayNumbers = allowedDays.map(d => dayMap[d.toLowerCase()])

  // Build list of valid send dates starting from today
  const validDates: Date[] = []
  const startDate = new Date(startFrom)
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
    for (let i = 0; i < spreadOverDays; i++) {
      const checkDate = new Date(startDate)
      checkDate.setDate(checkDate.getDate() + i)
      validDates.push(checkDate)
    }
  }

  // Distribute emails evenly across valid dates
  const emailsPerDay = Math.ceil(emails.length / validDates.length)

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
export function moveToNextAllowedDay(date: Date, allowedDays: string[]): Date {
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

// ============================================================================
// MERGE FIELDS
// ============================================================================

export function applyMergeFields(
  content: string,
  email: ScheduledEmailLike,
  account: Record<string, any>,
  emailLogId?: number,
  starRatingBaseUrl: string = ''
): string {
  // Extract first/last name from account.name if dedicated fields aren't available
  const nameParts = (account.name || '').trim().split(/\s+/)
  const derivedFirstName = nameParts[0] || ''
  const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

  const buildRatingUrl = (stars: number) => {
    if (!emailLogId || !starRatingBaseUrl) return '#'
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

export function buildEmailFooter(
  userSettings: any,
  email: ScheduledEmailLike,
  emailLogId: number,
  appUrl: string
): string {
  // Build unsubscribe URL with email_log ID for tracking (matches email_logs table)
  const unsubscribeUrl = `${appUrl}/unsubscribe?id=${emailLogId}&email=${encodeURIComponent(email.to_email || '')}`

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
// FALLBACK EMAIL VALIDATION
// ============================================================================

/**
 * Fallback validation when SendGrid API is not available
 */
export function fallbackValidation(email: string): { status: 'valid' | 'risky' | 'invalid', score: number, reason: string | null, details: Record<string, any> } {
  const details: Record<string, any> = { fallback: true, jit: true }

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { status: 'invalid', score: 0, reason: 'invalid_format', details: { ...details, check: 'format' } }
  }

  const domain = email.split('@')[1].toLowerCase()

  // Check for common disposable email domains
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
    'yopmail.com', 'getnada.com', 'maildrop.cc', 'discard.email'
  ]

  if (disposableDomains.includes(domain)) {
    return { status: 'invalid', score: 0.1, reason: 'disposable', details: { ...details, check: 'disposable_domain' } }
  }

  // Check for role-based addresses
  const localPart = email.split('@')[0].toLowerCase()
  const roleAddresses = ['admin', 'info', 'support', 'sales', 'contact', 'help', 'noreply', 'no-reply']

  if (roleAddresses.includes(localPart)) {
    return { status: 'risky', score: 0.5, reason: 'role_address', details: { ...details, check: 'role_address' } }
  }

  // Check for obviously fake patterns
  if (/^(test|fake|sample|example)@/i.test(email) || /@(test|fake|sample|example)\./i.test(email)) {
    return { status: 'invalid', score: 0.1, reason: 'test_address', details: { ...details, check: 'fake_pattern' } }
  }

  // Passed basic checks
  return { status: 'valid', score: 0.7, reason: null, details: { ...details, check: 'passed_basic' } }
}
