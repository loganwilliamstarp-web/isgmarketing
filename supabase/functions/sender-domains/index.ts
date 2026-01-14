// supabase/functions/sender-domains/index.ts
// Edge function for managing sender domain authentication with SendGrid
// Keeps API key secure on server-side

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authenticatedEmail = user.email

    // Parse request
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const body = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE'
      ? await req.json()
      : {}

    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')
    if (!sendGridApiKey) {
      return new Response(
        JSON.stringify({ error: 'SendGrid API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Look up user in users table by email (since Supabase auth ID differs from user_unique_id)
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('user_unique_id, marketing_cloud_agency_admin')
      .eq('email', authenticatedEmail)
      .limit(1)
      .single()

    if (!userData) {
      return new Response(
        JSON.stringify({ error: 'User not found in users table' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authenticatedUserId = userData.user_unique_id
    const isAdmin = userData.marketing_cloud_agency_admin === true

    // For list and verified actions, allow admins to query a target user's domains
    // Otherwise, use the authenticated user's ID
    const ownerId = (isAdmin && body.targetOwnerId) ? body.targetOwnerId : authenticatedUserId

    let result

    switch (action) {
      case 'list':
        result = await listDomains(supabaseAdmin, ownerId)
        break

      case 'add':
        result = await addDomain(supabaseAdmin, ownerId, body.domain, body.subdomain, sendGridApiKey)
        break

      case 'verify':
        result = await verifyDomain(supabaseAdmin, ownerId, body.domainId, sendGridApiKey)
        break

      case 'delete':
        result = await deleteDomain(supabaseAdmin, ownerId, body.domainId, sendGridApiKey)
        break

      case 'update':
        result = await updateDefaults(supabaseAdmin, ownerId, body.domainId, body.updates)
        break

      case 'verified':
        result = await getVerifiedDomains(supabaseAdmin, ownerId)
        break

      case 'enable-inbound-parse':
        result = await enableInboundParse(supabaseAdmin, ownerId, body.domainId, body.subdomain, sendGridApiKey)
        break

      case 'disable-inbound-parse':
        result = await disableInboundParse(supabaseAdmin, ownerId, body.domainId, sendGridApiKey)
        break

      case 'get-inbound-parse-status':
        result = await getInboundParseStatus(supabaseAdmin, ownerId, body.domainId, sendGridApiKey)
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sender domains error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// Domain Management Functions
// ============================================================================

async function listDomains(supabase: any, ownerId: string) {
  const { data, error } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return { domains: data || [] }
}

async function getVerifiedDomains(supabase: any, ownerId: string) {
  // Get the user's email domain to match against verified sender domains
  const { data: userData } = await supabase
    .from('users')
    .select('email')
    .eq('user_unique_id', ownerId)
    .single()

  if (!userData?.email) {
    console.log('getVerifiedDomains: No user email found for ownerId:', ownerId)
    return { domains: [] }
  }

  // Extract domain from user's email (e.g., "john@smithinsurance.com" -> "smithinsurance.com")
  const userEmailDomain = userData.email.split('@')[1]?.toLowerCase()

  if (!userEmailDomain) {
    console.log('getVerifiedDomains: Could not extract domain from email:', userData.email)
    return { domains: [] }
  }

  console.log('getVerifiedDomains: Looking for verified domains matching:', userEmailDomain, 'for user:', ownerId)

  // Get verified domains that match the user's email domain
  // Match either exact domain OR subdomains (e.g., em123.isgdfw.com matches isgdfw.com)
  const { data, error } = await supabase
    .from('sender_domains')
    .select('id, domain, default_from_email, default_from_name')
    .eq('status', 'verified')
    .or(`domain.eq.${userEmailDomain},domain.ilike.%.${userEmailDomain}`)
    .order('domain')

  console.log('getVerifiedDomains: Found domains:', data?.length || 0, data?.map((d: any) => d.domain))

  if (error) {
    console.error('getVerifiedDomains error:', error)
    throw error
  }
  return { domains: data || [] }
}

async function addDomain(
  supabase: any,
  ownerId: string,
  domain: string,
  subdomain: string | null,
  apiKey: string
) {
  // Clean the domain
  const cleanDomain = domain.toLowerCase().trim()
    .replace(/^(https?:\/\/)?/, '')
    .replace(/\/$/, '')

  // Validate domain format
  if (!cleanDomain.includes('.') || cleanDomain.includes('/')) {
    throw new Error('Invalid domain format')
  }

  // Check if already exists
  const { data: existing } = await supabase
    .from('sender_domains')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('domain', cleanDomain)
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error('This domain is already registered to your account')
  }

  // Build SendGrid request body - only include subdomain if provided
  const sgBody: any = {
    domain: cleanDomain,
    automatic_security: true,
    custom_spf: false,
    default: false
  }

  // Only add subdomain if explicitly provided
  if (subdomain) {
    sgBody.subdomain = subdomain
  }

  // Create domain authentication in SendGrid
  const sgResponse = await fetch(`${SENDGRID_API_URL}/whitelabel/domains`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sgBody)
  })

  if (!sgResponse.ok) {
    const sgError = await sgResponse.json()
    throw new Error(sgError.errors?.[0]?.message || 'Failed to create domain authentication in SendGrid')
  }

  const sgResult = await sgResponse.json()

  // Format DNS records
  const dnsRecords = formatDnsRecords(sgResult.dns)

  // Store in database
  const { data, error } = await supabase
    .from('sender_domains')
    .insert({
      owner_id: ownerId,
      domain: cleanDomain,
      subdomain: subdomain || null,
      sendgrid_domain_id: sgResult.id,
      status: 'pending',
      dns_records: dnsRecords,
      default_from_email: `noreply@${cleanDomain}`,
      default_from_name: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw error

  return { domain: data }
}

async function verifyDomain(
  supabase: any,
  ownerId: string,
  domainId: string,
  apiKey: string
) {
  // Get the domain record
  const { data: domain, error: fetchError } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .single()

  if (fetchError || !domain) {
    throw new Error('Domain not found')
  }

  if (!domain.sendgrid_domain_id) {
    throw new Error('Domain is missing SendGrid authentication ID')
  }

  // First, get the current domain info from SendGrid to get full DNS records
  const domainInfoResponse = await fetch(
    `${SENDGRID_API_URL}/whitelabel/domains/${domain.sendgrid_domain_id}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  let currentDnsRecords = domain.dns_records || {}
  if (domainInfoResponse.ok) {
    const domainInfo = await domainInfoResponse.json()
    if (domainInfo.dns) {
      // Get the full DNS records with host/data from the domain info
      currentDnsRecords = formatDnsRecords(domainInfo.dns)
    }
  }

  // Validate with SendGrid
  const sgResponse = await fetch(
    `${SENDGRID_API_URL}/whitelabel/domains/${domain.sendgrid_domain_id}/validate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!sgResponse.ok) {
    const sgError = await sgResponse.json()
    throw new Error(sgError.errors?.[0]?.message || 'Failed to validate domain')
  }

  const sgResult = await sgResponse.json()

  // Merge validation results with current DNS records (to preserve host/data)
  const mergedRecords = mergeValidationWithDnsRecords(currentDnsRecords, sgResult.validation_results)

  // Update database
  const updates: any = {
    dns_records: mergedRecords,
    last_check_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  if (sgResult.valid) {
    updates.status = 'verified'
    updates.verified_at = new Date().toISOString()
  } else {
    updates.status = 'pending'
  }

  const { data, error } = await supabase
    .from('sender_domains')
    .update(updates)
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .select()
    .single()

  if (error) throw error

  return {
    domain: data,
    valid: sgResult.valid,
    validationResults: sgResult.validation_results
  }
}

async function deleteDomain(
  supabase: any,
  ownerId: string,
  domainId: string,
  apiKey: string
) {
  // Get domain first
  const { data: domain } = await supabase
    .from('sender_domains')
    .select('sendgrid_domain_id')
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .single()

  // Delete from SendGrid if we have an ID
  if (domain?.sendgrid_domain_id) {
    try {
      await fetch(`${SENDGRID_API_URL}/whitelabel/domains/${domain.sendgrid_domain_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
    } catch (err) {
      console.warn('Failed to delete from SendGrid:', err)
    }
  }

  // Delete from database
  const { error } = await supabase
    .from('sender_domains')
    .delete()
    .eq('owner_id', ownerId)
    .eq('id', domainId)

  if (error) throw error

  return { success: true }
}

async function updateDefaults(
  supabase: any,
  ownerId: string,
  domainId: string,
  updates: { defaultFromEmail?: string; defaultFromName?: string }
) {
  const { data, error } = await supabase
    .from('sender_domains')
    .update({
      default_from_email: updates.defaultFromEmail,
      default_from_name: updates.defaultFromName,
      updated_at: new Date().toISOString()
    })
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .select()
    .single()

  if (error) throw error

  return { domain: data }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDnsRecords(dns: any) {
  const records: any = {}

  if (dns.mail_cname) {
    records.mail_cname = {
      type: 'CNAME',
      host: dns.mail_cname.host,
      data: dns.mail_cname.data,
      valid: dns.mail_cname.valid || false
    }
  }

  if (dns.dkim1) {
    records.dkim1 = {
      type: 'CNAME',
      host: dns.dkim1.host,
      data: dns.dkim1.data,
      valid: dns.dkim1.valid || false
    }
  }

  if (dns.dkim2) {
    records.dkim2 = {
      type: 'CNAME',
      host: dns.dkim2.host,
      data: dns.dkim2.data,
      valid: dns.dkim2.valid || false
    }
  }

  return records
}

// Merge validation results with existing DNS records to preserve host/data values
function mergeValidationWithDnsRecords(dnsRecords: any, validationResults: any) {
  const merged: any = {}

  const recordKeys = ['mail_cname', 'dkim1', 'dkim2']

  for (const key of recordKeys) {
    const existing = dnsRecords[key]
    const validation = validationResults?.[key]

    if (existing || validation) {
      merged[key] = {
        type: 'CNAME',
        // Prefer existing host/data, fall back to validation results
        host: existing?.host || validation?.host || '',
        data: existing?.data || validation?.data || '',
        // Use validation result for valid status
        valid: validation?.valid || false,
        reason: validation?.reason
      }
    }
  }

  return merged
}

// ============================================================================
// Inbound Parse Functions
// ============================================================================

async function enableInboundParse(
  supabase: any,
  ownerId: string,
  domainId: string,
  subdomain: string | undefined,
  apiKey: string
) {
  // Get domain record
  const { data: domain, error: fetchError } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .single()

  if (fetchError || !domain) {
    throw new Error('Domain not found')
  }

  if (domain.status !== 'verified') {
    throw new Error('Domain must be verified before enabling inbound parse')
  }

  // Use provided subdomain or default to 'parse'
  const inboundSubdomain = subdomain || 'parse'
  const hostname = `${inboundSubdomain}.${domain.domain}`

  // Get the webhook URL from environment or construct it
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const webhookUrl = `${supabaseUrl}/functions/v1/sendgrid-inbound-parse`

  // Configure inbound parse in SendGrid
  // https://docs.sendgrid.com/api-reference/settings-inbound-parse/create-a-parse-setting
  const sgResponse = await fetch(`${SENDGRID_API_URL}/user/webhooks/parse/settings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hostname: hostname,
      url: webhookUrl,
      spam_check: false,
      send_raw: false
    })
  })

  if (!sgResponse.ok) {
    const sgError = await sgResponse.json()
    // Check if it's a "hostname already exists" error - that's fine
    const errorMsg = sgError.errors?.[0]?.message || ''
    if (!errorMsg.toLowerCase().includes('already exists')) {
      throw new Error(sgError.errors?.[0]?.message || 'Failed to configure inbound parse in SendGrid')
    }
  }

  // Update database
  const { data, error } = await supabase
    .from('sender_domains')
    .update({
      inbound_parse_enabled: true,
      inbound_subdomain: inboundSubdomain,
      updated_at: new Date().toISOString()
    })
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .select()
    .single()

  if (error) throw error

  return {
    domain: data,
    inboundParseConfig: {
      hostname: hostname,
      webhookUrl: webhookUrl,
      mxRecord: {
        type: 'MX',
        host: inboundSubdomain,
        value: 'mx.sendgrid.net',
        priority: 10
      }
    }
  }
}

async function disableInboundParse(
  supabase: any,
  ownerId: string,
  domainId: string,
  apiKey: string
) {
  // Get domain record
  const { data: domain, error: fetchError } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .single()

  if (fetchError || !domain) {
    throw new Error('Domain not found')
  }

  // Delete from SendGrid if enabled
  if (domain.inbound_parse_enabled && domain.inbound_subdomain) {
    const hostname = `${domain.inbound_subdomain}.${domain.domain}`

    try {
      await fetch(`${SENDGRID_API_URL}/user/webhooks/parse/settings/${hostname}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
    } catch (err) {
      console.warn('Failed to delete inbound parse from SendGrid:', err)
    }
  }

  // Update database
  const { data, error } = await supabase
    .from('sender_domains')
    .update({
      inbound_parse_enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .select()
    .single()

  if (error) throw error

  return { domain: data }
}

async function getInboundParseStatus(
  supabase: any,
  ownerId: string,
  domainId: string,
  apiKey: string
) {
  // Get domain record
  const { data: domain, error: fetchError } = await supabase
    .from('sender_domains')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', domainId)
    .single()

  if (fetchError || !domain) {
    throw new Error('Domain not found')
  }

  let sendgridConfig = null

  if (domain.inbound_parse_enabled && domain.inbound_subdomain) {
    const hostname = `${domain.inbound_subdomain}.${domain.domain}`

    try {
      const sgResponse = await fetch(`${SENDGRID_API_URL}/user/webhooks/parse/settings/${hostname}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })

      if (sgResponse.ok) {
        sendgridConfig = await sgResponse.json()
      }
    } catch (err) {
      console.warn('Failed to get inbound parse status from SendGrid:', err)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

  return {
    enabled: domain.inbound_parse_enabled || false,
    subdomain: domain.inbound_subdomain || 'parse',
    hostname: domain.inbound_parse_enabled
      ? `${domain.inbound_subdomain}.${domain.domain}`
      : null,
    webhookUrl: `${supabaseUrl}/functions/v1/sendgrid-inbound-parse`,
    sendgridConfig,
    mxRecord: {
      type: 'MX',
      host: domain.inbound_subdomain || 'parse',
      value: 'mx.sendgrid.net',
      priority: 10
    }
  }
}
