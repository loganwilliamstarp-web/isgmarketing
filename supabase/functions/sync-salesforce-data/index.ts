// supabase/functions/sync-salesforce-data/index.ts
// Unified edge function for syncing Salesforce data to Supabase
// Handles: accounts, policies, carriers, producers

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Field mappings from Salesforce to Supabase
const FIELD_MAPPINGS = {
  accounts: {
    // Salesforce field -> Supabase column
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
    'CreatedDate': 'salesforce_created_at',
    'LastModifiedDate': 'salesforce_updated_at',
  },
  policies: {
    'Id': 'policy_unique_id',
    'Name': 'name',
    'Account__c': 'account_id',
    'Policy_Number__c': 'policy_number',  // Added policy number mapping
    'Policy_LOB__c': 'policy_lob',
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
    'CreatedDate': 'salesforce_created_at',
    'LastModifiedDate': 'salesforce_updated_at',
  },
  carriers: {
    'Id': 'carrier_unique_id',
    'Name': 'name',
    'Carrier_Code__c': 'carrier_code',
    'Is_Active__c': 'is_active',
  },
  producers: {
    'Id': 'producer_unique_id',
    'Name': 'name',
    'Email__c': 'email',
    'Producer_Code__c': 'producer_code',
    'Is_Active__c': 'is_active',
  }
}

// Parse CSV content
function parseCSV(csvContent: string): { headers: string[], rows: string[][] } {
  const lines = csvContent.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }
  
  // Parse header row
  const headers = parseCSVRow(lines[0])
  
  // Remove duplicate headers (keep first occurrence)
  const seenHeaders = new Set<string>()
  const uniqueHeaders: string[] = []
  const headerIndices: number[] = []
  
  headers.forEach((header, index) => {
    if (!seenHeaders.has(header)) {
      seenHeaders.add(header)
      uniqueHeaders.push(header)
      headerIndices.push(index)
    }
  })
  
  // Parse data rows, keeping only columns with unique headers
  const rows = lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const allValues = parseCSVRow(line)
      return headerIndices.map(i => allValues[i] || '')
    })
  
  return { headers: uniqueHeaders, rows }
}

// Parse a single CSV row (handles quoted values)
function parseCSVRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  
  return values
}

// Transform row data using field mappings
function transformRow(
  headers: string[], 
  row: string[], 
  mappings: Record<string, string>
): Record<string, any> {
  const transformed: Record<string, any> = {}
  
  headers.forEach((header, index) => {
    const targetColumn = mappings[header]
    if (targetColumn && row[index] !== undefined && row[index] !== '') {
      let value: any = row[index]
      
      // Handle date fields
      if (targetColumn.includes('date') || targetColumn.includes('_at')) {
        if (value && !isNaN(Date.parse(value))) {
          value = new Date(value).toISOString()
        } else {
          value = null
        }
      }
      
      // Handle boolean fields
      if (targetColumn === 'is_active') {
        value = value.toLowerCase() === 'true' || value === '1'
      }
      
      // Handle numeric fields
      if (targetColumn.includes('premium')) {
        value = parseFloat(value) || null
      }
      
      transformed[targetColumn] = value
    }
  })
  
  return transformed
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

    const formData = await req.formData()
    const file = formData.get('file') as File
    const tableType = formData.get('table') as string // 'accounts', 'policies', 'carriers', 'producers'
    const ownerId = formData.get('owner_id') as string

    if (!file || !tableType) {
      return new Response(
        JSON.stringify({ error: 'Missing file or table type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mappings = FIELD_MAPPINGS[tableType as keyof typeof FIELD_MAPPINGS]
    if (!mappings) {
      return new Response(
        JSON.stringify({ error: `Unknown table type: ${tableType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse CSV
    const csvContent = await file.text()
    const { headers, rows } = parseCSV(csvContent)

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data rows found in CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Transform rows
    const transformedRows = rows.map(row => {
      const transformed = transformRow(headers, row, mappings)
      
      // Add owner_id if provided and not already in the data
      if (ownerId && !transformed.owner_id) {
        transformed.owner_id = ownerId
      }
      
      // Add timestamps
      transformed.updated_at = new Date().toISOString()
      
      return transformed
    })

    // Determine unique key for upsert
    const uniqueKeyMap: Record<string, string> = {
      accounts: 'account_unique_id',
      policies: 'policy_unique_id',
      carriers: 'carrier_unique_id',
      producers: 'producer_unique_id',
    }
    const uniqueKey = uniqueKeyMap[tableType]

    // Filter out rows without the unique key
    const validRows = transformedRows.filter(row => row[uniqueKey])

    if (validRows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid rows with unique ID found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert data
    const { data, error } = await supabaseClient
      .from(tableType)
      .upsert(validRows, { 
        onConflict: uniqueKey,
        ignoreDuplicates: false 
      })
      .select()

    if (error) {
      console.error('Upsert error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the import
    await supabaseClient.from('import_logs').insert({
      owner_id: ownerId,
      table_name: tableType,
      records_processed: rows.length,
      records_imported: validRows.length,
      status: 'success',
    })

    return new Response(
      JSON.stringify({
        success: true,
        table: tableType,
        processed: rows.length,
        imported: validRows.length,
        skipped: rows.length - validRows.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
