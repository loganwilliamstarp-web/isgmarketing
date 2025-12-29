// supabase/functions/sync-salesforce-data/index.ts
// Unified edge function for syncing Salesforce data to Supabase
// Handles: accounts, policies, carriers, producers
// Accepts: multipart/form-data OR application/json

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
    'Policy_Number__c': 'policy_number',
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

// Transform row data using field mappings (case-insensitive header matching)
function transformRow(
  headers: string[], 
  row: string[], 
  mappings: Record<string, string>
): Record<string, any> {
  const transformed: Record<string, any> = {}
  
  // Create case-insensitive lookup for mappings
  const mappingsLower: Record<string, string> = {}
  for (const [key, value] of Object.entries(mappings)) {
    mappingsLower[key.toLowerCase()] = value
  }
  
  headers.forEach((header, index) => {
    // Try exact match first, then case-insensitive
    const targetColumn = mappings[header] || mappingsLower[header.toLowerCase()]
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

    let csvContent: string = ''
    let tableType: string = ''
    let ownerId: string | null = null
    let receivedFields: string[] = []

    // Check content type to determine how to parse the request
    const contentType = req.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      // Handle JSON request (from Google Apps Script)
      const body = await req.json()
      
      // Track received fields for debugging
      receivedFields = Object.keys(body)
      console.log('Received JSON fields:', receivedFields)
      
      // Try multiple possible field names for CSV content
      csvContent = body.csv || body.csvContent || body.data || body.content || body.csvData || body.payload || ''
      
      // Check if headers are provided separately (for chunked uploads)
      // If so, prepend them to the CSV content
      const separateHeaders = body.headers || body.csvHeaders || body.headerRow || ''
      if (separateHeaders && csvContent && !csvContent.startsWith(separateHeaders)) {
        // Headers provided separately - prepend them to CSV content
        csvContent = separateHeaders + '\n' + csvContent
        console.log('Prepended separate headers to CSV content')
      }
      
      // Try multiple possible field names for table type
      tableType = body.table || body.tableType || body.tableName || body.type || ''
      
      // If no table type, try to determine from reportName/fileName
      if (!tableType) {
        const reportName = (body.reportName || body.fileName || body.filename || body.report || body.name || '').toLowerCase()
        if (reportName.includes('account')) tableType = 'accounts'
        else if (reportName.includes('policy')) tableType = 'policies'
        else if (reportName.includes('carrier')) tableType = 'carriers'
        else if (reportName.includes('producer')) tableType = 'producers'
        else if (reportName.includes('user')) tableType = 'users'
        
        if (tableType) console.log(`Mapped reportName "${reportName}" to table "${tableType}"`)
      }
      
      // Try multiple possible field names for owner ID
      ownerId = body.owner_id || body.ownerId || body.owner || null
      
      // Handle base64 encoded CSV
      if (body.csvBase64 || body.base64) {
        csvContent = atob(body.csvBase64 || body.base64)
      }
      
      // If csvContent is still empty but body has a string property we haven't tried
      if (!csvContent) {
        // Look for any string property that looks like CSV (contains commas and newlines)
        for (const key of Object.keys(body)) {
          const val = body[key]
          if (typeof val === 'string' && val.includes(',') && val.includes('\n')) {
            csvContent = val
            console.log(`Found CSV content in field: ${key}`)
            break
          }
        }
      }
      
      // Auto-detect table type from CSV headers if not provided
      if (!tableType && csvContent) {
        const firstLine = csvContent.split('\n')[0].toLowerCase()
        if (firstLine.includes('account_status') || firstLine.includes('personemail') || firstLine.includes('billingstreet')) {
          tableType = 'accounts'
        } else if (firstLine.includes('policy_lob') || firstLine.includes('policy_number') || firstLine.includes('policy_status')) {
          tableType = 'policies'
        } else if (firstLine.includes('carrier_code')) {
          tableType = 'carriers'
        } else if (firstLine.includes('producer_code')) {
          tableType = 'producers'
        }
        if (tableType) console.log(`Auto-detected table type from CSV headers: ${tableType}`)
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Handle form data request
      const formData = await req.formData()
      const file = formData.get('file') as File
      tableType = formData.get('table') as string || ''
      ownerId = formData.get('owner_id') as string
      
      // Also check for reportName in form data
      if (!tableType) {
        const reportName = (formData.get('reportName') as string || formData.get('fileName') as string || '').toLowerCase()
        if (reportName.includes('account')) tableType = 'accounts'
        else if (reportName.includes('policy')) tableType = 'policies'
        else if (reportName.includes('carrier')) tableType = 'carriers'
        else if (reportName.includes('producer')) tableType = 'producers'
      }
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: 'Missing file in form data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      csvContent = await file.text()
      
      // Auto-detect table type from CSV headers if not provided
      if (!tableType && csvContent) {
        const firstLine = csvContent.split('\n')[0].toLowerCase()
        if (firstLine.includes('account_status') || firstLine.includes('personemail') || firstLine.includes('billingstreet')) {
          tableType = 'accounts'
        } else if (firstLine.includes('policy_lob') || firstLine.includes('policy_number') || firstLine.includes('policy_status')) {
          tableType = 'policies'
        } else if (firstLine.includes('carrier_code')) {
          tableType = 'carriers'
        } else if (firstLine.includes('producer_code')) {
          tableType = 'producers'
        }
        if (tableType) console.log(`Auto-detected table type from CSV headers: ${tableType}`)
      }
    } else {
      // Try to parse as JSON anyway (for requests without proper content-type)
      try {
        const body = await req.json()
        
        receivedFields = Object.keys(body)
        console.log('Fallback JSON parsing, fields:', receivedFields)
        
        csvContent = body.csv || body.csvContent || body.data || body.content || body.csvData || body.payload || ''
        
        // Check if headers are provided separately (for chunked uploads)
        const separateHeaders = body.headers || body.csvHeaders || body.headerRow || ''
        if (separateHeaders && csvContent && !csvContent.startsWith(separateHeaders)) {
          csvContent = separateHeaders + '\n' + csvContent
          console.log('Prepended separate headers to CSV content')
        }
        
        tableType = body.table || body.tableType || body.tableName || body.type || ''
        
        // If no table type, try to determine from reportName/fileName
        if (!tableType) {
          const reportName = (body.reportName || body.fileName || body.filename || body.report || body.name || '').toLowerCase()
          if (reportName.includes('account')) tableType = 'accounts'
          else if (reportName.includes('policy')) tableType = 'policies'
          else if (reportName.includes('carrier')) tableType = 'carriers'
          else if (reportName.includes('producer')) tableType = 'producers'
          else if (reportName.includes('user')) tableType = 'users'
        }
        
        ownerId = body.owner_id || body.ownerId || body.owner || null
        
        if (body.csvBase64 || body.base64) {
          csvContent = atob(body.csvBase64 || body.base64)
        }
        
        // Look for CSV in any string field
        if (!csvContent) {
          for (const key of Object.keys(body)) {
            const val = body[key]
            if (typeof val === 'string' && val.includes(',') && val.includes('\n')) {
              csvContent = val
              break
            }
          }
        }
        
        // Auto-detect table type from CSV headers if not provided
        if (!tableType && csvContent) {
          const firstLine = csvContent.split('\n')[0].toLowerCase()
          if (firstLine.includes('account_status') || firstLine.includes('personemail') || firstLine.includes('billingstreet')) {
            tableType = 'accounts'
          } else if (firstLine.includes('policy_lob') || firstLine.includes('policy_number') || firstLine.includes('policy_status')) {
            tableType = 'policies'
          } else if (firstLine.includes('carrier_code')) {
            tableType = 'carriers'
          } else if (firstLine.includes('producer_code')) {
            tableType = 'producers'
          }
          if (tableType) console.log(`Auto-detected table type from CSV headers: ${tableType}`)
        }
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid request format. Send JSON with {csv, table, owner_id} or multipart/form-data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!csvContent || !tableType) {
      // Get first line of CSV to help debug
      const csvFirstLine = csvContent ? csvContent.split('\n')[0].substring(0, 200) : 'no csv content'
      
      return new Response(
        JSON.stringify({ 
          error: 'Missing csv content or table type',
          received: {
            fields: receivedFields,
            hasCsv: !!csvContent,
            csvLength: csvContent?.length || 0,
            csvHeaderPreview: csvFirstLine,
            tableType: tableType || 'not provided',
            ownerId: ownerId || 'not provided'
          },
          hint: 'Table type should auto-detect from CSV headers. If not, include reportName or table field.',
          acceptedReportNames: ['Account_Master.csv', 'Policy_Master.csv', 'Carrier_Master.csv', 'Producer_Master.csv'],
          acceptedTableTypes: ['accounts', 'policies', 'carriers', 'producers']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mappings = FIELD_MAPPINGS[tableType as keyof typeof FIELD_MAPPINGS]
    if (!mappings) {
      return new Response(
        JSON.stringify({ error: `Unknown table type: ${tableType}. Valid types: accounts, policies, carriers, producers` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse CSV
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

    // Filter out rows without the unique key (must be non-empty string)
    const validRows = transformedRows.filter(row => {
      const val = row[uniqueKey]
      return val !== undefined && val !== null && val !== ''
    })

    if (validRows.length === 0) {
      // Find which source field should map to the unique key
      const sourceFieldForUniqueKey = Object.entries(mappings).find(([_, target]) => target === uniqueKey)?.[0] || 'unknown'
      
      // Check if the source field exists in headers (case-insensitive)
      const headersLower = headers.map(h => h.toLowerCase())
      const hasSourceField = headers.includes(sourceFieldForUniqueKey) || headersLower.includes(sourceFieldForUniqueKey.toLowerCase())
      
      // Find index of the Id field in headers
      const idFieldIndex = headers.findIndex(h => h.toLowerCase() === sourceFieldForUniqueKey.toLowerCase())
      
      // Get sample of first 3 raw rows for that column
      const sampleRawIdValues = rows.slice(0, 3).map(row => idFieldIndex >= 0 ? row[idFieldIndex] : 'field not found')
      
      // Get sample of first transformed row
      const sampleRow = transformedRows[0] || {}
      
      return new Response(
        JSON.stringify({ 
          error: 'No valid rows with unique ID found',
          debug: {
            tableType,
            uniqueKeyExpected: uniqueKey,
            sourceFieldNeeded: sourceFieldForUniqueKey,
            sourceFieldFoundInHeaders: hasSourceField,
            sourceFieldIndexInHeaders: idFieldIndex,
            sampleRawIdValues: sampleRawIdValues,
            csvHeaders: headers.slice(0, 30), // First 30 headers
            totalHeaders: headers.length,
            totalRows: rows.length,
            transformedRowsCount: transformedRows.length,
            sampleTransformedFields: Object.keys(sampleRow),
            sampleTransformedRow: Object.fromEntries(
              Object.entries(sampleRow).slice(0, 10) // First 10 fields
            )
          },
          hint: `CSV must have "${sourceFieldForUniqueKey}" column that maps to "${uniqueKey}". Check if header name matches exactly.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert data in batches to avoid timeouts
    const batchSize = 500
    let totalImported = 0
    
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize)
      
      const { error } = await supabaseClient
        .from(tableType)
        .upsert(batch, { 
          onConflict: uniqueKey,
          ignoreDuplicates: false 
        })

      if (error) {
        console.error('Upsert error:', error)
        return new Response(
          JSON.stringify({ 
            error: error.message,
            batch: Math.floor(i / batchSize) + 1,
            rowsProcessedBeforeError: totalImported
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      totalImported += batch.length
    }

    // Log the import
    try {
      await supabaseClient.from('import_logs').insert({
        owner_id: ownerId,
        table_name: tableType,
        records_processed: rows.length,
        records_imported: validRows.length,
        status: 'success',
      })
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('Failed to log import:', logError)
    }

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
