// supabase/functions/submit-feedback/index.ts
// Edge function to handle feedback form submissions from low star ratings

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const body = await req.json()
    const { emailLogId, accountId, feedback } = body

    if (!emailLogId || !feedback) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the account with the feedback
    if (accountId) {
      await supabaseClient
        .from('accounts')
        .update({
          survey_feedback_text: feedback,
          updated_at: new Date().toISOString()
        })
        .eq('account_unique_id', accountId)
    }

    // Get email log to find owner for activity logging
    const { data: emailLog } = await supabaseClient
      .from('email_logs')
      .select('owner_id, account_id')
      .eq('id', emailLogId)
      .single()

    // Log the feedback event
    if (emailLog) {
      await supabaseClient
        .from('activity_log')
        .insert({
          owner_id: emailLog.owner_id,
          event_type: 'survey_feedback',
          event_category: 'engagement',
          title: 'Customer left feedback',
          description: feedback.substring(0, 200) + (feedback.length > 200 ? '...' : ''),
          email_log_id: parseInt(emailLogId, 10),
          account_id: accountId || emailLog.account_id,
          actor_type: 'customer',
          severity: 'warning',
          metadata: { feedback_length: feedback.length },
          created_at: new Date().toISOString()
        })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Submit feedback error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
