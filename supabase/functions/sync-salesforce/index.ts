// supabase/functions/sync-salesforce/index.ts
// Pull-based Salesforce -> Supabase sync.
//
// Runs on an hourly pg_cron schedule. Each object is synced incrementally
// using its Salesforce SystemModstamp as a high-water-mark cursor (stored in
// salesforce_sync_state). The first runs - with the cursor at the epoch -
// backfill the full history; once caught up it only pulls hourly deltas.
//
// Schema-adaptive: it calls the Salesforce describe API and only queries
// fields that actually exist, skips objects that don't exist, and drops any
// Supabase column that isn't in the table. So a renamed/missing field never
// breaks the sync - that field just doesn't populate.
//
// Replaces the push-based sync-salesforce-data CSV upload (and its CSV
// parsing bug). Keep that function until this one is verified, then retire it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SF_API_VERSION = 'v60.0'
const FUNCTION_TIMEOUT_MS = 48000 // stop before the edge function wall-clock limit
const UPSERT_BATCH_SIZE = 500
const SF_PAGE_SIZE = 2000

// Field mappings: Salesforce field API name -> Supabase column.
// This is the "wish list" - the describe call filters it down to fields that
// actually exist on the object, and the upsert drops columns the table lacks.
const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  accounts: {
    'Id': 'account_unique_id',
    'Name': 'name',
    'Account_Status__c': 'account_status',
    'Account_Type__c': 'account_type',
    'PersonEmail': 'person_email',
    'Email__c': 'email',
    'Phone': 'phone',
    'BillingStreet': 'billing_street',
    'BillingCity': 'billing_city',
    'BillingState': 'billing_state',
    'BillingPostalCode': 'billing_postal_code',
    'BillingCountry': 'billing_country',
    'Primary_Contact_First_Name__c': 'primary_contact_first_name',
    'Primary_Contact_Last_Name__c': 'primary_contact_last_name',
    'OwnerId': 'owner_id',
  },
  policies: {
    'Id': 'policy_unique_id',
    'Name': 'name',
    'Account__c': 'account_id',
    'Policy_Number__c': 'policy_number',
    'Policy_LOB__c': 'policy_lob',
    'Policy_Type__c': 'policy_type', // picklist: New Business / Renewal — drives the Pipeline report's Sold count
    'Policy_Status__c': 'policy_status',
    'Policy_Class__c': 'policy_class',
    'Policy_Term__c': 'policy_term',
    'Effective_Date__c': 'effective_date',
    'Expiration_Date__c': 'expiration_date',
    'Annual_Premium__c': 'annual_premium',
    'Written_Premium__c': 'written_premium',
    'Carrier__c': 'carrier_id',
    'Producer__c': 'producer_id',
    'OwnerId': 'owner_id',
  },
  carriers: {
    'Id': 'id',
    'Name': 'name',
  },
  producers: {
    'Id': 'producer_unique_id',
    'Name': 'name',
    'OwnerId': 'owner_id',
  },
}

// Objects to sync. `table` is the Supabase table. `object` is the Salesforce
// object API name. An object that doesn't exist is skipped (not fatal), so a
// wrong name here just means that table doesn't sync - correct it if needed.
const SYNC_OBJECTS = [
  { object: 'Account', table: 'accounts', uniqueKey: 'account_unique_id', mappings: FIELD_MAPPINGS.accounts },
  { object: 'Policy__c', table: 'policies', uniqueKey: 'policy_unique_id', mappings: FIELD_MAPPINGS.policies },
  { object: 'Carrier__c', table: 'carriers', uniqueKey: 'id', mappings: FIELD_MAPPINGS.carriers },
  { object: 'Producer_CSR__c', table: 'producers', uniqueKey: 'producer_unique_id', mappings: FIELD_MAPPINGS.producers },
]

// OAuth 2.0 client-credentials token from the Salesforce connected app
async function getSalesforceToken(): Promise<{ accessToken: string, instanceUrl: string }> {
  const loginUrl = Deno.env.get('SF_LOGIN_URL') // e.g. https://yourorg.my.salesforce.com
  const clientId = Deno.env.get('SF_CLIENT_ID')
  const clientSecret = Deno.env.get('SF_CLIENT_SECRET')
  if (!loginUrl || !clientId || !clientSecret) {
    throw new Error('Missing SF_LOGIN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET secrets')
  }

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    throw new Error(`Salesforce token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return { accessToken: data.access_token, instanceUrl: data.instance_url }
}

// Returns the set of field API names on a Salesforce object (lower-cased),
// or null if the object doesn't exist in this org.
async function getObjectFields(
  instanceUrl: string,
  accessToken: string,
  object: string,
): Promise<Set<string> | null> {
  const res = await fetch(
    `${instanceUrl}/services/data/${SF_API_VERSION}/sobjects/${object}/describe`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`describe ${object} failed ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  return new Set((data.fields || []).map((f: any) => String(f.name).toLowerCase()))
}

// Convert a SF record (JSON) to a DB row using the field mappings
function transformRecord(record: any, mappings: Record<string, string>): Record<string, any> {
  const row: Record<string, any> = {}
  for (const [sfField, dbCol] of Object.entries(mappings)) {
    let v = record[sfField]
    if (v === undefined || v === null || v === '') continue

    if (dbCol.includes('date') || dbCol.endsWith('_at')) {
      const d = new Date(v)
      v = isNaN(d.getTime()) ? null : d.toISOString()
    } else if (dbCol === 'is_active') {
      v = v === true || v === 'true' || v === '1'
    } else if (dbCol.includes('premium')) {
      v = typeof v === 'number' ? v : (parseFloat(v) || null)
    }

    if (v !== null) row[dbCol] = v
  }
  row.updated_at = new Date().toISOString()
  return row
}

// SOQL datetime literal: unquoted, no milliseconds (e.g. 2026-01-15T10:30:00Z)
function soqlDateTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19) + 'Z'
}

// Upsert a batch, self-healing around Supabase columns the table doesn't have.
// Discovered missing columns are collected in `missingCols` so later batches
// skip them up front.
async function upsertBatch(
  supabase: any,
  table: string,
  rows: Record<string, any>[],
  uniqueKey: string,
  missingCols: Set<string>,
): Promise<void> {
  const strip = (rs: Record<string, any>[]) =>
    missingCols.size === 0 ? rs : rs.map((r) => {
      const c = { ...r }
      for (const m of missingCols) delete c[m]
      return c
    })

  let payload = strip(rows)
  for (let attempt = 0; attempt < 15; attempt++) {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: uniqueKey })
    if (!error) return
    const match = error.message?.match(/Could not find the '([^']+)' column/)
    if (!match) throw new Error(`upsert ${table}: ${error.message}`)
    missingCols.add(match[1])
    payload = strip(rows)
  }
  throw new Error(`upsert ${table}: unresolved schema mismatch`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  const startTime = Date.now()
  const isTimedOut = () => Date.now() - startTime > FUNCTION_TIMEOUT_MS

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const summary: any = { objects: {}, errors: [] as string[], hasMore: false }

  try {
    const { accessToken, instanceUrl } = await getSalesforceToken()
    let anyAdvanced = false

    for (const obj of SYNC_OBJECTS) {
      if (isTimedOut()) {
        summary.hasMore = true
        break
      }

      const { data: state } = await supabase
        .from('salesforce_sync_state')
        .select('last_synced_at, records_synced')
        .eq('table_name', obj.table)
        .maybeSingle()

      const startCursor: string = state?.last_synced_at || '1970-01-01T00:00:00Z'
      let cursor = startCursor
      let recordsThisRun = 0
      let objError: string | null = null
      const missingCols = new Set<string>()

      try {
        // Describe the object so we only query fields that actually exist.
        const sfFields = await getObjectFields(instanceUrl, accessToken, obj.object)
        if (sfFields === null) {
          throw new Error(`object ${obj.object} does not exist in this Salesforce org - skipped`)
        }

        const mappedFields = Object.keys(obj.mappings).filter((k) => sfFields.has(k.toLowerCase()))
        const skipped = Object.keys(obj.mappings).filter((k) => !sfFields.has(k.toLowerCase()))
        if (skipped.length > 0) {
          console.log(`[${obj.object}] skipping fields not on the object: ${skipped.join(', ')}`)
        }
        const fields = [...new Set(['Id', 'SystemModstamp', ...mappedFields])]

        const soql = `SELECT ${fields.join(', ')} FROM ${obj.object} ` +
          `WHERE SystemModstamp >= ${soqlDateTime(startCursor)} ORDER BY SystemModstamp`
        let url: string | null = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`

        while (url && !isTimedOut()) {
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Sforce-Query-Options': `batchSize=${SF_PAGE_SIZE}`,
            },
          })
          if (!res.ok) {
            throw new Error(`query failed ${res.status}: ${await res.text()}`)
          }
          const page = await res.json()
          const records: any[] = page.records || []

          if (records.length > 0) {
            const rows = records
              .map((r) => transformRecord(r, obj.mappings))
              .filter((r) => r[obj.uniqueKey])

            for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
              await upsertBatch(
                supabase, obj.table, rows.slice(i, i + UPSERT_BATCH_SIZE), obj.uniqueKey, missingCols,
              )
            }
            recordsThisRun += rows.length

            // Advance the cursor to this page's max SystemModstamp and
            // checkpoint it, so a mid-run timeout still preserves progress.
            const lastStamp = records[records.length - 1].SystemModstamp
            if (lastStamp) {
              cursor = lastStamp
              await supabase.from('salesforce_sync_state').upsert({
                table_name: obj.table,
                last_synced_at: cursor,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'table_name' })
            }
          }

          url = page.done ? null : `${instanceUrl}${page.nextRecordsUrl}`
        }

        // url still set => stopped by the timeout guard with more pages left
        if (url) summary.hasMore = true
      } catch (e: any) {
        objError = e.message
        summary.errors.push(`[${obj.object}] ${e.message}`)
      }

      if (new Date(cursor).getTime() > new Date(startCursor).getTime()) {
        anyAdvanced = true
      }

      await supabase.from('salesforce_sync_state').upsert({
        table_name: obj.table,
        last_run_at: new Date().toISOString(),
        last_status: objError ? 'error' : 'success',
        last_error: objError,
        records_synced: (state?.records_synced || 0) + recordsThisRun,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'table_name' })

      summary.objects[obj.table] = { records: recordsThisRun, cursor, error: objError }
    }

    // Self-continue to drain a backlog (the initial backfill). Guarded by
    // anyAdvanced so a stuck cursor or persistent error can't loop forever.
    // Must go through EdgeRuntime.waitUntil: a plain fire-and-forget fetch is
    // killed with the isolate as soon as the response returns, so the chain
    // silently stops after one run.
    if (summary.hasMore && anyAdvanced) {
      const continuation = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-salesforce`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      }).catch(() => {})
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime
      if (runtime?.waitUntil) runtime.waitUntil(continuation)
    }

    return new Response(
      JSON.stringify({ success: summary.errors.length === 0, ...summary }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('sync-salesforce error:', e.message)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
