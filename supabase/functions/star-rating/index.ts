// supabase/functions/star-rating/index.ts
// Edge function to handle star rating clicks from periodic review emails
// Records rating and redirects to thank-you page on main app

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// App URL for redirects (feedback page is hosted on the main app)
// Ensure URL always has https:// prefix
const rawAppUrl = Deno.env.get('APP_URL') || 'isgmarketing-production.up.railway.app'
const APP_URL = rawAppUrl.startsWith('http') ? rawAppUrl : `https://${rawAppUrl}`

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const emailLogId = url.searchParams.get('id')
    const rating = parseInt(url.searchParams.get('rating') || '0', 10)
    const accountId = url.searchParams.get('account')

    // Invalid rating - redirect to feedback page with error
    if (!emailLogId || !rating || rating < 1 || rating > 5) {
      const redirectUrl = `${APP_URL}/feedback?status=invalid`
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl }
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the email log to find the owner and get their settings
    const { data: emailLog, error: logError } = await supabaseClient
      .from('email_logs')
      .select('owner_id, account_id')
      .eq('id', emailLogId)
      .single()

    if (logError || !emailLog) {
      console.error('Email log not found:', logError)
      const redirectUrl = `${APP_URL}/feedback?status=error&rating=${rating}`
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl }
      })
    }

    // Get user settings for Google review link and min stars threshold
    const { data: userSettings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('google_review_link, google_review_min_stars')
      .eq('user_id', emailLog.owner_id)
      .single()

    console.log('Star rating debug:', {
      emailLogId,
      rating,
      owner_id: emailLog.owner_id,
      userSettings,
      settingsError: settingsError?.message
    })

    const googleReviewLink = userSettings?.google_review_link || ''
    const minStarsForReview = userSettings?.google_review_min_stars || 5 // Default to 5 stars only

    // Record the rating in the account
    const actualAccountId = accountId || emailLog.account_id
    console.log('Attempting to record rating:', { actualAccountId, rating, emailLogId })

    if (actualAccountId) {
      // Use ilike for case-insensitive matching since account IDs might have different casing
      const { data: updateData, error: updateError } = await supabaseClient
        .from('accounts')
        .update({
          survey_stars: rating,
          survey_completed_at: new Date().toISOString(),
          survey_email_log_id: parseInt(emailLogId, 10)
        })
        .ilike('account_unique_id', actualAccountId)
        .select('account_unique_id')

      if (updateError) {
        console.error('Failed to update account with rating:', updateError)
      } else if (!updateData || updateData.length === 0) {
        console.warn('No account found with account_unique_id:', actualAccountId)
      } else {
        console.log('Successfully updated account:', updateData[0].account_unique_id)
      }
    } else {
      console.warn('No account ID available to record rating')
    }

    // Log the rating event
    await supabaseClient
      .from('email_events')
      .insert({
        email_log_id: emailLogId,
        event_type: 'star_rating',
        event_data: { rating, account_id: actualAccountId },
        created_at: new Date().toISOString()
      })

    // Log activity
    await supabaseClient
      .from('activity_log')
      .insert({
        owner_id: emailLog.owner_id,
        event_type: 'survey_completed',
        event_category: 'engagement',
        title: `Customer rated ${rating} star${rating > 1 ? 's' : ''}`,
        description: `Rating received from periodic review email`,
        email_log_id: parseInt(emailLogId, 10),
        account_id: actualAccountId,
        actor_type: 'customer',
        severity: rating >= minStarsForReview ? 'success' : (rating <= 2 ? 'warning' : 'info'),
        metadata: { rating },
        created_at: new Date().toISOString()
      })

    // For ratings >= min threshold, redirect to Google Review if available
    if (rating >= minStarsForReview && googleReviewLink) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': googleReviewLink }
      })
    }

    // For ratings >= min threshold but no Google link, show thank you
    if (rating >= minStarsForReview) {
      const redirectUrl = `${APP_URL}/feedback?rating=${rating}&status=success`
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl }
      })
    }

    // For ratings below threshold, redirect to feedback page with form
    const redirectUrl = `${APP_URL}/feedback?rating=${rating}&id=${emailLogId}&account=${actualAccountId || ''}&feedback=true`
    return new Response(null, {
      status: 302,
      headers: { 'Location': redirectUrl }
    })

  } catch (error: any) {
    console.error('Star rating error:', error)
    const redirectUrl = `${APP_URL}/feedback?status=error`
    return new Response(null, {
      status: 302,
      headers: { 'Location': redirectUrl }
    })
  }
})
