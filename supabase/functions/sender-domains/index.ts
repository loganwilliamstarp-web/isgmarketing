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

    const ownerId = user.id

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
  const { data, error } = await supabase
    .from('sender_domains')
    .select('id, domain, default_from_email, default_from_name')
    .eq('owner_id', ownerId)
    .eq('status', 'verified')
    .order('domain')

  if (error) throw error
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

  // Update database
  const updates: any = {
    dns_records: formatValidationResult(sgResult.validation_results),
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

function formatValidationResult(results: any) {
  const records: any = {}

  if (results.mail_cname) {
    records.mail_cname = {
      type: 'CNAME',
      host: results.mail_cname.host || '',
      data: results.mail_cname.data || '',
      valid: results.mail_cname.valid || false,
      reason: results.mail_cname.reason
    }
  }

  if (results.dkim1) {
    records.dkim1 = {
      type: 'CNAME',
      host: results.dkim1.host || '',
      data: results.dkim1.data || '',
      valid: results.dkim1.valid || false,
      reason: results.dkim1.reason
    }
  }

  if (results.dkim2) {
    records.dkim2 = {
      type: 'CNAME',
      host: results.dkim2.host || '',
      data: results.dkim2.data || '',
      valid: results.dkim2.valid || false,
      reason: results.dkim2.reason
    }
  }

  return records
}
