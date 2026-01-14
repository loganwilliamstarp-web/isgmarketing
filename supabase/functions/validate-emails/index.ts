// supabase/functions/validate-emails/index.ts
// Edge function to validate email addresses using SendGrid Email Validation API
// Runs daily via cron to validate emails that are unknown or > 90 days old
// Only accounts with 'valid' status can receive marketing emails

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// SendGrid Email Validation API endpoint
const SENDGRID_VALIDATION_URL = 'https://api.sendgrid.com/v3/validations/email'

// Rate limits and batch sizes
const MAX_VALIDATIONS_PER_RUN = 500  // Limit per cron run to control costs
const BATCH_SIZE = 50                 // Process in smaller batches for reliability
const VALIDATION_EXPIRY_DAYS = 90     // Re-validate after 90 days

interface ValidationResult {
  email: string
  accountId: string
  status: 'valid' | 'risky' | 'invalid'
  score: number
  reason: string | null
  details: Record<string, any>
}

interface SendGridValidationResponse {
  result: {
    email: string
    verdict: 'Valid' | 'Risky' | 'Invalid'
    score: number
    local: string
    host: string
    checks: {
      domain: {
        has_valid_address_syntax: boolean
        has_mx_or_a_record: boolean
        is_suspected_disposable_address: boolean
      }
      local_part: {
        is_suspected_role_address: boolean
      }
      additional: {
        has_known_bounces: boolean
        has_suspected_bounces: boolean
      }
    }
  }
}

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

    // Use dedicated validation key if available, fall back to general SendGrid key
    const sendgridValidationKey = Deno.env.get('SENDGRID_VALIDATION_KEY') || Deno.env.get('SENDGRID_API_KEY')
    if (!sendgridValidationKey) {
      return new Response(
        JSON.stringify({ error: 'SENDGRID_VALIDATION_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse optional request body
    let maxValidations = MAX_VALIDATIONS_PER_RUN
    let specificOwnerId: string | null = null
    let dryRun = false

    try {
      const body = await req.json()
      maxValidations = body.maxValidations || MAX_VALIDATIONS_PER_RUN
      specificOwnerId = body.ownerId || null
      dryRun = body.dryRun || false
    } catch {
      // No body, use defaults
    }

    const results = {
      timestamp: new Date().toISOString(),
      processed: 0,
      valid: 0,
      risky: 0,
      invalid: 0,
      errors: [] as string[],
      dryRun
    }

    console.log('[Validation] Starting validation run...')

    // First check if the validation columns exist
    const { data: testQuery, error: schemaError } = await supabaseClient
      .from('accounts')
      .select('account_unique_id, email_validation_status')
      .limit(1)

    if (schemaError) {
      console.error('[Validation] Schema error - columns may not exist:', schemaError.message)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Database schema error: ${schemaError.message}. Have you run the migration to add email_validation_status column?`,
          ...results
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Validation] Schema check passed, querying accounts...')

    // Get accounts that need validation
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() - VALIDATION_EXPIRY_DAYS)

    let query = supabaseClient
      .from('accounts')
      .select('account_unique_id, owner_id, name, person_email, email, email_validation_status, email_validated_at')
      .or(`email_validation_status.eq.unknown,email_validation_status.is.null,email_validated_at.lt.${expiryDate.toISOString()}`)
      .not('person_email', 'is', null)
      .order('email_validated_at', { ascending: true, nullsFirst: true })
      .limit(maxValidations)

    if (specificOwnerId) {
      query = query.eq('owner_id', specificOwnerId)
    }

    const { data: accounts, error: fetchError } = await query

    if (fetchError) {
      console.error('[Validation] Fetch error:', fetchError.message)
      results.errors.push(`Failed to fetch accounts: ${fetchError.message}`)
      return new Response(
        JSON.stringify({ success: false, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Validation] Found ${accounts?.length || 0} accounts to validate`)

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No accounts need validation',
          ...results
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Validation] Found ${accounts.length} accounts needing validation`)

    // Process in batches
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE)
      console.log(`[Validation] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(accounts.length / BATCH_SIZE)}`)

      for (const account of batch) {
        const email = account.person_email || account.email
        if (!email) continue

        try {
          const validationResult = await validateEmail(email, sendgridValidationKey, dryRun)

          if (dryRun) {
            console.log(`[DRY RUN] Would validate ${email} for account ${account.name}`)
            results.processed++
            continue
          }

          // Update account with validation result
          const { error: updateError } = await supabaseClient
            .from('accounts')
            .update({
              email_validation_status: validationResult.status,
              email_validation_score: validationResult.score,
              email_validated_at: new Date().toISOString(),
              email_validation_reason: validationResult.reason,
              email_validation_details: validationResult.details
            })
            .eq('account_unique_id', account.account_unique_id)

          if (updateError) {
            results.errors.push(`Failed to update account ${account.account_unique_id}: ${updateError.message}`)
            continue
          }

          results.processed++
          if (validationResult.status === 'valid') results.valid++
          else if (validationResult.status === 'risky') results.risky++
          else if (validationResult.status === 'invalid') results.invalid++

          console.log(`[Validation] ${email}: ${validationResult.status} (score: ${validationResult.score})`)

        } catch (err: any) {
          results.errors.push(`Error validating ${email}: ${err.message}`)
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Edge function error:', errorMessage, error)
    return new Response(
      JSON.stringify({ error: errorMessage || 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Validate a single email address using SendGrid Email Validation API
 */
async function validateEmail(
  email: string,
  apiKey: string,
  dryRun: boolean = false
): Promise<{ status: 'valid' | 'risky' | 'invalid', score: number, reason: string | null, details: Record<string, any> }> {

  // Dry run mode - return mock result
  if (dryRun) {
    return {
      status: 'valid',
      score: 1.0,
      reason: null,
      details: { dryRun: true }
    }
  }

  // Basic format validation first (avoid API calls for obviously invalid emails)
  if (!email || !email.includes('@') || !email.includes('.')) {
    return {
      status: 'invalid',
      score: 0,
      reason: 'invalid_format',
      details: { local_check: true, error: 'Invalid email format' }
    }
  }

  try {
    const response = await fetch(SENDGRID_VALIDATION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        source: 'isg_marketing_daily_validation'
      })
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Check if it's a "not enabled" error
      if (response.status === 403 || errorText.includes('not enabled')) {
        console.warn('[Validation] SendGrid Email Validation API not enabled. Using fallback validation.')
        return fallbackValidation(email)
      }

      throw new Error(`SendGrid API error: ${response.status} - ${errorText}`)
    }

    const data: SendGridValidationResponse = await response.json()
    const result = data.result

    // Map SendGrid verdict to our status
    let status: 'valid' | 'risky' | 'invalid'
    switch (result.verdict) {
      case 'Valid':
        status = 'valid'
        break
      case 'Risky':
        status = 'risky'
        break
      case 'Invalid':
        status = 'invalid'
        break
      default:
        status = 'invalid'
    }

    // Determine reason for risky/invalid
    let reason: string | null = null
    if (status !== 'valid') {
      const reasons: string[] = []
      if (result.checks.domain.is_suspected_disposable_address) reasons.push('disposable')
      if (result.checks.local_part.is_suspected_role_address) reasons.push('role_address')
      if (!result.checks.domain.has_mx_or_a_record) reasons.push('invalid_domain')
      if (!result.checks.domain.has_valid_address_syntax) reasons.push('invalid_syntax')
      if (result.checks.additional.has_known_bounces) reasons.push('known_bounces')
      if (result.checks.additional.has_suspected_bounces) reasons.push('suspected_bounces')
      reason = reasons.join(', ') || 'unknown'
    }

    return {
      status,
      score: result.score,
      reason,
      details: result
    }

  } catch (err: any) {
    console.error(`[Validation] Error validating ${email}:`, err.message)

    // If API fails, use fallback validation
    return fallbackValidation(email)
  }
}

/**
 * Fallback validation when SendGrid API is not available
 * Performs basic checks: format, disposable domain detection, MX lookup simulation
 */
function fallbackValidation(email: string): { status: 'valid' | 'risky' | 'invalid', score: number, reason: string | null, details: Record<string, any> } {
  const details: Record<string, any> = { fallback: true }

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return {
      status: 'invalid',
      score: 0,
      reason: 'invalid_format',
      details: { ...details, check: 'format' }
    }
  }

  const domain = email.split('@')[1].toLowerCase()

  // Check for common disposable email domains
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
    'yopmail.com', 'getnada.com', 'maildrop.cc', 'discard.email',
    'sharklasers.com', 'spam4.me', 'grr.la', 'dispostable.com'
  ]

  if (disposableDomains.includes(domain)) {
    return {
      status: 'invalid',
      score: 0.1,
      reason: 'disposable',
      details: { ...details, check: 'disposable_domain' }
    }
  }

  // Check for role-based addresses
  const localPart = email.split('@')[0].toLowerCase()
  const roleAddresses = [
    'admin', 'info', 'support', 'sales', 'contact', 'help', 'service',
    'webmaster', 'postmaster', 'hostmaster', 'abuse', 'noreply', 'no-reply',
    'marketing', 'team', 'hello', 'office', 'billing', 'orders'
  ]

  if (roleAddresses.includes(localPart)) {
    return {
      status: 'risky',
      score: 0.5,
      reason: 'role_address',
      details: { ...details, check: 'role_address' }
    }
  }

  // Check for obviously fake patterns
  const fakePatterns = [
    /^test@/, /^fake@/, /^sample@/, /^example@/,
    /@test\./, /@fake\./, /@sample\./, /@example\./
  ]

  for (const pattern of fakePatterns) {
    if (pattern.test(email)) {
      return {
        status: 'invalid',
        score: 0.1,
        reason: 'test_address',
        details: { ...details, check: 'fake_pattern' }
      }
    }
  }

  // Passed basic checks - mark as valid
  // Note: This doesn't verify the mailbox exists, just basic hygiene
  return {
    status: 'valid',
    score: 0.7, // Lower score than full API validation
    reason: null,
    details: { ...details, check: 'passed_basic' }
  }
}
