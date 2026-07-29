// Tests for the pure decision logic behind the scheduled-email engine.
// Runs under Vitest (npm test); the module itself is dependency-free so the
// same code is exercised here and in the Deno edge runtime.

import { describe, expect, it } from 'vitest'
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
  getTimezoneOffsetHours,
  matchDate,
  matchNumber,
  matchValue,
  moveToNextAllowedDay,
} from './logic.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// ============================================================================
// enrollmentLimitReached
// ============================================================================

describe('enrollmentLimitReached', () => {
  const now = new Date('2026-07-01T12:00:00Z').getTime()

  it('is unlimited when the automation has no caps', () => {
    expect(enrollmentLimitReached(99, '2026-06-30T00:00:00Z', {}, now).limited).toBe(false)
    expect(enrollmentLimitReached(99, null, { max_enrollments: null, enrollment_cooldown_days: 0 }, now).limited).toBe(false)
  })

  it('blocks once max_enrollments is reached', () => {
    const automation = { max_enrollments: 1 }
    expect(enrollmentLimitReached(0, null, automation, now).limited).toBe(false)
    expect(enrollmentLimitReached(1, null, automation, now).limited).toBe(true)
    expect(enrollmentLimitReached(2, null, automation, now).limited).toBe(true)
  })

  it('blocks inside the cooldown window and allows outside it', () => {
    const automation = { enrollment_cooldown_days: 30 }
    const tenDaysAgo = new Date(now - 10 * DAY_MS).toISOString()
    const fortyDaysAgo = new Date(now - 40 * DAY_MS).toISOString()
    expect(enrollmentLimitReached(1, tenDaysAgo, automation, now).limited).toBe(true)
    expect(enrollmentLimitReached(1, fortyDaysAgo, automation, now).limited).toBe(false)
  })

  it('never applies cooldown without a prior send', () => {
    expect(enrollmentLimitReached(0, null, { enrollment_cooldown_days: 30 }, now).limited).toBe(false)
  })
})

// ============================================================================
// timezone conversion
// ============================================================================

describe('getScheduledDateTimeUTC', () => {
  it('converts Chicago winter (CST, UTC-6)', () => {
    const result = getScheduledDateTimeUTC(new Date(2026, 0, 15), '09:00', 'America/Chicago')
    expect(result).toBe('2026-01-15T15:00:00.000Z')
  })

  it('converts Chicago summer (CDT, UTC-5)', () => {
    const result = getScheduledDateTimeUTC(new Date(2026, 6, 15), '09:00', 'America/Chicago')
    expect(result).toBe('2026-07-15T14:00:00.000Z')
  })

  it('handles Phoenix (no DST) in summer', () => {
    const result = getScheduledDateTimeUTC(new Date(2026, 6, 15), '09:00', 'America/Phoenix')
    expect(result).toBe('2026-07-15T16:00:00.000Z')
  })

  it('handles UTC directly', () => {
    const result = getScheduledDateTimeUTC(new Date(2026, 3, 10), '10:30', 'UTC')
    expect(result).toBe('2026-04-10T10:30:00.000Z')
  })

  it('handles non-US zones (was previously mis-scheduled as CST)', () => {
    // Asia/Kolkata is UTC+5:30 year-round
    const result = getScheduledDateTimeUTC(new Date(2026, 0, 15), '09:00', 'Asia/Kolkata')
    expect(result).toBe('2026-01-15T03:30:00.000Z')
  })

  it('falls back to Central time for invalid timezone strings', () => {
    expect(getTimezoneOffsetHours('Not/AZone', new Date(2026, 0, 15))).toBe(6)
    expect(getTimezoneOffsetHours('Not/AZone', new Date(2026, 6, 15))).toBe(5)
  })
})

// ============================================================================
// extractDateTriggerRules
// ============================================================================

describe('extractDateTriggerRules', () => {
  it('returns no rules for an empty/missing config', () => {
    expect(extractDateTriggerRules(null)).toEqual([])
    expect(extractDateTriggerRules({ groups: [] })).toEqual([])
  })

  it('uses the inner bound (more_than_days_future) as journey start', () => {
    const config = {
      groups: [{
        rules: [
          { field: 'policy_expiration', operator: 'more_than_days_future', value: '80' },
          { field: 'policy_expiration', operator: 'less_than_days_future', value: '90' },
        ]
      }]
    }
    const rules = extractDateTriggerRules(config)
    expect(rules).toHaveLength(1)
    expect(rules[0].field).toBe('policy_expiration')
    expect(rules[0].daysBeforeTrigger).toBe(80)
  })

  it('uses the outer bound only when no inner bound exists', () => {
    const config = {
      groups: [{
        rules: [{ field: 'policy_expiration', operator: 'less_than_days_future', value: '90' }]
      }]
    }
    expect(extractDateTriggerRules(config)[0].daysBeforeTrigger).toBe(90)
  })

  it('treats in_last_days as days AFTER the trigger (negative)', () => {
    const config = {
      groups: [{
        rules: [{ field: 'account_created', operator: 'in_last_days', value: '30' }]
      }]
    }
    expect(extractDateTriggerRules(config)[0].daysBeforeTrigger).toBe(-30)
  })

  it('captures the group policy type/term alongside the trigger', () => {
    const config = {
      groups: [{
        rules: [
          { field: 'policy_expiration', operator: 'in_next_days', value: '60' },
          { field: 'active_policy_type', operator: 'is', value: 'Personal Auto' },
          { field: 'policy_term', operator: 'is', value: '6 months' },
        ]
      }]
    }
    const [rule] = extractDateTriggerRules(config)
    expect(rule.daysBeforeTrigger).toBe(60)
    expect(rule.policyType).toBe('Personal Auto')
    expect(rule.policyTerm).toBe('6 months')
  })

  it('ignores non-trigger operators on date fields', () => {
    const config = {
      groups: [{
        rules: [{ field: 'account_created', operator: 'before', value: '2025-01-01' }]
      }]
    }
    expect(extractDateTriggerRules(config)).toEqual([])
  })
})

// ============================================================================
// buildEmailSchedule / getFinalSendEmailNodeId
// ============================================================================

describe('buildEmailSchedule', () => {
  const nodes = [
    { id: 'entry', type: 'entry_criteria', config: {} },
    { id: 'e1', type: 'send_email', config: { template: 'tpl-1' } },
    { id: 'd1', type: 'delay', config: { duration: 1, unit: 'weeks' } },
    { id: 'e2', type: 'send_email', config: { template: 'tpl-2' } },
    { id: 'd2', type: 'delay', config: { duration: 3, unit: 'days' } },
    { id: 'e3', type: 'send_email', config: { templateKey: 'renewal_final' } },
  ]

  it('accumulates delays across steps', () => {
    const { schedule } = buildEmailSchedule(nodes, { renewal_final: 'tpl-3' })
    expect(schedule).toEqual([
      { nodeId: 'e1', templateId: 'tpl-1', daysOffset: 0 },
      { nodeId: 'e2', templateId: 'tpl-2', daysOffset: 7 },
      { nodeId: 'e3', templateId: 'tpl-3', daysOffset: 10 },
    ])
  })

  it('reports steps whose templateKey does not resolve', () => {
    const { schedule, skipped } = buildEmailSchedule(nodes, {})
    expect(schedule.map(s => s.nodeId)).toEqual(['e1', 'e2'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].nodeId).toBe('e3')
    expect(skipped[0].reason).toContain('renewal_final')
  })

  it('reports send_email nodes with no template at all', () => {
    const { skipped } = buildEmailSchedule([{ id: 'x', type: 'send_email', config: {} }])
    expect(skipped[0].reason).toContain('no template')
  })

  it('walks yes-branches', () => {
    const branched = [
      {
        id: 'cond', type: 'condition', config: {},
        branches: { yes: [{ id: 'e-b', type: 'send_email', config: { template: 'tpl-b' } }] }
      },
    ]
    const { schedule } = buildEmailSchedule(branched)
    expect(schedule.map(s => s.nodeId)).toEqual(['e-b'])
  })
})

describe('getFinalSendEmailNodeId', () => {
  it('returns the last send_email node id', () => {
    const nodes = [
      { id: 'e1', type: 'send_email', config: { template: 't1' } },
      { id: 'd1', type: 'delay', config: { duration: 1, unit: 'days' } },
      { id: 'e2', type: 'send_email', config: { template: 't2' } },
    ]
    expect(getFinalSendEmailNodeId(nodes)).toBe('e2')
  })

  it('returns null when there are no send_email nodes', () => {
    expect(getFinalSendEmailNodeId([{ id: 'd', type: 'delay', config: {} }])).toBeNull()
    expect(getFinalSendEmailNodeId([])).toBeNull()
  })
})

// ============================================================================
// filterAccountsByConfig
// ============================================================================

describe('filterAccountsByConfig', () => {
  const acctAuto = { account_unique_id: 'A1', name: 'Auto Only', billing_state: 'TX' }
  const acctHome = { account_unique_id: 'A2', name: 'Home Only', billing_state: 'OK' }
  const acctNone = { account_unique_id: 'A3', name: 'No Policies', billing_state: 'TX' }
  const accounts = [acctAuto, acctHome, acctNone]
  const policies = [
    { account_id: 'A1', policy_lob: 'Personal Auto', policy_status: 'Active', policy_term: '6 months', policy_class: 'Personal' },
    { account_id: 'A2', policy_lob: 'Homeowners', policy_status: 'Active', policy_term: '12 months', policy_class: 'Personal' },
  ]

  it('returns all accounts when there are no filter groups', () => {
    expect(filterAccountsByConfig(accounts, policies, { groups: [] })).toHaveLength(3)
    expect(filterAccountsByConfig(accounts, policies, null)).toHaveLength(3)
  })

  it('matches by active policy type', () => {
    const config = { groups: [{ rules: [{ field: 'active_policy_type', operator: 'is', value: 'Personal Auto' }] }] }
    expect(filterAccountsByConfig(accounts, policies, config).map(a => a.account_unique_id)).toEqual(['A1'])
  })

  it('is_not policy type also matches accounts with no policies', () => {
    const config = { groups: [{ rules: [{ field: 'active_policy_type', operator: 'is_not', value: 'Personal Auto' }] }] }
    expect(filterAccountsByConfig(accounts, policies, config).map(a => a.account_unique_id)).toEqual(['A2', 'A3'])
  })

  it('ANDs rules within a group', () => {
    const config = {
      groups: [{
        rules: [
          { field: 'billing_state', operator: 'is', value: 'TX' },
          { field: 'active_policy_type', operator: 'is', value: 'Personal Auto' },
        ]
      }]
    }
    expect(filterAccountsByConfig(accounts, policies, config).map(a => a.account_unique_id)).toEqual(['A1'])
  })

  it('ORs across groups', () => {
    const config = {
      groups: [
        { rules: [{ field: 'billing_state', operator: 'is', value: 'OK' }] },
        { rules: [{ field: 'active_policy_type', operator: 'is', value: 'Personal Auto' }] },
      ]
    }
    expect(filterAccountsByConfig(accounts, policies, config).map(a => a.account_unique_id)).toEqual(['A1', 'A2'])
  })

  it('skips date-trigger rules (the scheduler owns them)', () => {
    const config = {
      groups: [{
        rules: [{ field: 'policy_expiration', operator: 'in_next_days', value: '60' }]
      }]
    }
    // date-trigger rule alone means every account passes the base filter
    expect(filterAccountsByConfig(accounts, policies, config)).toHaveLength(3)
  })

  it('policy_count uses active policy counts', () => {
    const config = { groups: [{ rules: [{ field: 'policy_count', operator: 'at_least', value: '1' }] }] }
    expect(filterAccountsByConfig(accounts, policies, config).map(a => a.account_unique_id)).toEqual(['A1', 'A2'])
  })

  it('last_email_sent treats never-emailed as "long ago"', () => {
    const config = { groups: [{ rules: [{ field: 'last_email_sent', operator: 'more_than_days_ago', value: '30' }] }] }
    const lastSent = { A1: new Date(Date.now() - 5 * DAY_MS).toISOString() }
    const matched = filterAccountsByConfig(accounts, policies, config, lastSent)
    // A1 was emailed 5 days ago (inside 30) → excluded; A2/A3 never emailed → included
    expect(matched.map(a => a.account_unique_id)).toEqual(['A2', 'A3'])
  })

  it('KNOWN HAZARD: a group with no rules key matches every account', () => {
    // The seeded default automations write groups[].conditions[] instead of
    // groups[].rules[]; rules.every() on the missing array returns true, so
    // such a group matches the entire book. Documented here so any future
    // change to this behavior is deliberate. See also
    // create_default_automations_for_user in the schema.
    const config = { groups: [{ conditions: [{ field: 'account_type', operator: 'equals', value: 'X' }] }] }
    expect(filterAccountsByConfig(accounts, policies, config)).toHaveLength(3)
  })
})

// ============================================================================
// matchValue / matchNumber / matchDate
// ============================================================================

describe('matchValue', () => {
  it('handles equals with comma-separated actual values', () => {
    expect(matchValue('personal auto,homeowners', 'homeowners', 'is')).toBe(true)
    expect(matchValue('personal auto', 'homeowners', 'is')).toBe(false)
  })

  it('handles is_not across all values', () => {
    expect(matchValue('personal auto,homeowners', 'flood', 'is_not')).toBe(true)
    expect(matchValue('personal auto,homeowners', 'homeowners', 'is_not')).toBe(false)
  })

  it('handles substring semantics of is (includes)', () => {
    expect(matchValue('personal auto - tx', 'personal auto', 'is')).toBe(true)
  })

  it('handles contains / starts_with / ends_with', () => {
    expect(matchValue('homeowners', 'owner', 'contains')).toBe(true)
    expect(matchValue('homeowners', 'home', 'starts_with')).toBe(true)
    expect(matchValue('homeowners', 'owners', 'ends_with')).toBe(true)
  })

  it('handles empty checks', () => {
    expect(matchValue('', '', 'is_empty')).toBe(true)
    expect(matchValue('x', '', 'is_not_empty')).toBe(true)
  })

  it('in/not_in use exact membership', () => {
    expect(matchValue('tx', 'tx,ok', 'in')).toBe(true)
    expect(matchValue('texas', 'tx,ok', 'in')).toBe(false)
    expect(matchValue('ks', 'tx,ok', 'not_in')).toBe(true)
  })
})

describe('matchNumber', () => {
  it('compares with each operator', () => {
    expect(matchNumber(2, { operator: 'equals', value: '2' })).toBe(true)
    expect(matchNumber(3, { operator: 'greater_than', value: '2' })).toBe(true)
    expect(matchNumber(1, { operator: 'less_than', value: '2' })).toBe(true)
    expect(matchNumber(2, { operator: 'at_least', value: '2' })).toBe(true)
    expect(matchNumber(2, { operator: 'at_most', value: '2' })).toBe(true)
    expect(matchNumber(2, { operator: 'between', value: '1', value2: '3' })).toBe(true)
    expect(matchNumber(4, { operator: 'between', value: '1', value2: '3' })).toBe(false)
  })

  it('rejects non-numeric rule values', () => {
    expect(matchNumber(2, { operator: 'equals', value: 'abc' })).toBe(false)
  })
})

describe('matchDate', () => {
  const now = new Date('2026-07-01T00:00:00Z').getTime()

  it('handles empty checks', () => {
    expect(matchDate(null, { operator: 'is_empty' })).toBe(true)
    expect(matchDate('2026-01-01', { operator: 'is_not_empty' })).toBe(true)
    expect(matchDate(null, { operator: 'before', value: '2026-01-01' })).toBe(false)
  })

  it('handles absolute operators', () => {
    expect(matchDate('2025-12-01', { operator: 'before', value: '2026-01-01' })).toBe(true)
    expect(matchDate('2026-02-01', { operator: 'after', value: '2026-01-01' })).toBe(true)
    expect(matchDate('2026-01-15', { operator: 'between', value: '2026-01-01', value2: '2026-02-01' })).toBe(true)
  })

  it('handles relative day-offset operators', () => {
    const tenDaysAgo = new Date(now - 10 * DAY_MS).toISOString()
    const inTenDays = new Date(now + 10 * DAY_MS).toISOString()
    expect(matchDate(tenDaysAgo, { operator: 'more_than_days_ago', value: '5' }, now)).toBe(true)
    expect(matchDate(tenDaysAgo, { operator: 'less_than_days_ago', value: '30' }, now)).toBe(true)
    expect(matchDate(inTenDays, { operator: 'more_than_days_future', value: '5' }, now)).toBe(true)
    expect(matchDate(inTenDays, { operator: 'less_than_days_future', value: '30' }, now)).toBe(true)
    expect(matchDate(inTenDays, { operator: 'in_next_days', value: '30' }, now)).toBe(true)
    expect(matchDate(tenDaysAgo, { operator: 'in_last_days', value: '30' }, now)).toBe(true)
    expect(matchDate(tenDaysAgo, { operator: 'in_next_days', value: '30' }, now)).toBe(false)
  })
})

// ============================================================================
// pacing
// ============================================================================

describe('applyPacingDistribution', () => {
  // Wed 2026-07-01
  const start = new Date(2026, 6, 1)
  const emails = Array.from({ length: 6 }, (_, i) => ({ id: i, scheduled_for: '2026-07-01T14:00:00Z' }))

  it('spreads emails across allowed weekdays', () => {
    const result = applyPacingDistribution(emails, 3, ['mon', 'tue', 'wed', 'thu', 'fri'], '09:00', 'UTC', start)
    const days = [...new Set(result.map(e => e.scheduled_for.slice(0, 10)))]
    // 6 emails over 3 valid days → 2/day on Wed, Thu, Fri
    expect(days).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(result.filter(e => e.scheduled_for.startsWith('2026-07-01'))).toHaveLength(2)
  })

  it('skips disallowed days', () => {
    // start is Wednesday; only Mon/Fri allowed → Fri 07-03 then Mon 07-06
    const result = applyPacingDistribution(emails.slice(0, 2), 3, ['mon', 'fri'], '09:00', 'UTC', start)
    expect(result[0].scheduled_for.startsWith('2026-07-03')).toBe(true)
    expect(result[1].scheduled_for.startsWith('2026-07-06')).toBe(true)
  })

  it('KNOWN LIMIT: falls back to consecutive days when the scan window (2x spread) has no allowed day', () => {
    // Only Mondays allowed with spreadOverDays=2 scans just 4 days from Wed,
    // finds no Monday, and falls back to all days starting Wed. Documented so
    // a change to the scan window is deliberate.
    const result = applyPacingDistribution(emails.slice(0, 2), 2, ['mon'], '09:00', 'UTC', start)
    expect(result[0].scheduled_for.startsWith('2026-07-01')).toBe(true)
    expect(result[1].scheduled_for.startsWith('2026-07-02')).toBe(true)
  })
})

describe('moveToNextAllowedDay', () => {
  it('keeps allowed days as-is', () => {
    const wed = new Date(2026, 6, 1)
    expect(moveToNextAllowedDay(wed, ['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual(wed)
  })

  it('moves weekend sends to Monday', () => {
    const sat = new Date(2026, 6, 4)
    const moved = moveToNextAllowedDay(sat, ['mon', 'tue', 'wed', 'thu', 'fri'])
    expect(moved.getDay()).toBe(1) // Monday
    expect(moved.getDate()).toBe(6)
  })
})

// ============================================================================
// merge fields + footer
// ============================================================================

describe('applyMergeFields', () => {
  const account = {
    name: 'Jordan Smith',
    person_email: 'jordan@example.com',
    billing_city: 'Tulsa',
    billing_state: 'OK',
  }
  const email = { account_id: 'A1', to_name: 'Jordan Smith', to_email: 'jordan@example.com', qualification_value: '2026-09-01' }

  it('derives first/last name from account.name when contact fields are missing', () => {
    expect(applyMergeFields('Hi {{first_name}} {{last_name}}!', email, account)).toBe('Hi Jordan Smith!')
  })

  it('prefers primary contact fields when present', () => {
    const acct = { ...account, primary_contact_first_name: 'Jo', primary_contact_last_name: 'S' }
    expect(applyMergeFields('Hi {{first_name}}', email, acct)).toBe('Hi Jo')
  })

  it('is case-insensitive and tolerates spaces in braces', () => {
    expect(applyMergeFields('{{ First_Name }} in {{CITY}}', email, account)).toBe('Jordan in Tulsa')
  })

  it('fills trigger date', () => {
    expect(applyMergeFields('Renews {{trigger_date}}', email, account)).toBe('Renews 2026-09-01')
  })

  it('builds star rating URLs from the given base', () => {
    const out = applyMergeFields('{{rating_url_5}}', email, account, 123, 'https://x.test/star-rating')
    expect(out).toBe('https://x.test/star-rating?id=123&rating=5&account=A1')
  })

  it('renders "#" for rating links without a log id or base URL', () => {
    expect(applyMergeFields('{{rating_url_1}}', email, account)).toBe('#')
  })
})

describe('buildEmailFooter', () => {
  const email = { to_email: 'jordan@example.com' }

  it('includes the unsubscribe link with log id and encoded email', () => {
    const footer = buildEmailFooter({}, email, 42, 'https://app.example.com')
    expect(footer).toContain('https://app.example.com/unsubscribe?id=42&email=jordan%40example.com')
  })

  it('includes signature and agency line when configured', () => {
    const footer = buildEmailFooter({
      signature_html: '<p>Sig</p>',
      agency_name: 'Acme Insurance',
      agency_phone: '555-0100',
    }, email, 42, 'https://app.example.com')
    expect(footer).toContain('<p>Sig</p>')
    expect(footer).toContain('Acme Insurance | 555-0100')
  })
})

// ============================================================================
// fallback validation
// ============================================================================

describe('fallbackValidation', () => {
  it('rejects malformed addresses', () => {
    expect(fallbackValidation('nope').status).toBe('invalid')
    expect(fallbackValidation('a@b').status).toBe('invalid')
  })

  it('rejects disposable domains', () => {
    expect(fallbackValidation('x@mailinator.com')).toMatchObject({ status: 'invalid', reason: 'disposable' })
  })

  it('flags role addresses as risky', () => {
    expect(fallbackValidation('info@company.com')).toMatchObject({ status: 'risky', reason: 'role_address' })
  })

  it('rejects test addresses', () => {
    expect(fallbackValidation('test@company.com').status).toBe('invalid')
  })

  it('rejects example/test domains via the fake pattern', () => {
    expect(fallbackValidation('jordan@example.org').status).toBe('invalid')
  })

  it('passes ordinary addresses', () => {
    expect(fallbackValidation('jordan@acmeinsurance.org').status).toBe('valid')
  })
})
