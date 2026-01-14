// supabase/functions/star-rating/index.ts
// Edge function to handle star rating clicks from periodic review emails
// Redirects to Google Review for high ratings (configurable threshold), or shows feedback form for lower ratings

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

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

    if (!emailLogId || !rating || rating < 1 || rating > 5) {
      return new Response(
        generateThankYouPage('Invalid rating link', 'Sorry, this rating link appears to be invalid.', false, '', '', 0),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        }
      )
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
      return new Response(
        generateThankYouPage('Thank You!', 'We appreciate your feedback!', false, '', '', 0),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        }
      )
    }

    // Get user settings for Google review link and min stars threshold
    const { data: userSettings } = await supabaseClient
      .from('user_settings')
      .select('google_review_link, google_review_min_stars')
      .eq('user_id', emailLog.owner_id)
      .single()

    const googleReviewLink = userSettings?.google_review_link || ''
    const minStarsForReview = userSettings?.google_review_min_stars || 5 // Default to 5 stars only

    // Record the rating in the account
    const actualAccountId = accountId || emailLog.account_id
    if (actualAccountId) {
      await supabaseClient
        .from('accounts')
        .update({
          survey_stars: rating,
          survey_completed_at: new Date().toISOString(),
          survey_email_log_id: parseInt(emailLogId, 10)
        })
        .eq('account_unique_id', actualAccountId)
    }

    // Log the rating event
    await supabaseClient
      .from('email_events')
      .insert({
        email_log_id: parseInt(emailLogId, 10),
        event_type: 'star_rating',
        event_timestamp: new Date().toISOString(),
        raw_payload: { rating, account_id: actualAccountId }
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
      // Redirect to Google Review
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': googleReviewLink
        }
      })
    }

    // For ratings >= min threshold but no Google link configured
    if (rating >= minStarsForReview) {
      return new Response(
        generateThankYouPage(
          'Thank You for Your Positive Feedback!',
          `We're thrilled to hear you had a great experience with us! Your ${rating}-star rating means the world to us.`,
          false,
          '',
          '',
          0
        ),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        }
      )
    }

    // For ratings below threshold, show feedback form
    const feedbackTitles: Record<number, string> = {
      1: 'We\'d Love to Hear From You',
      2: 'Help Us Improve',
      3: 'Share Your Thoughts',
      4: 'Thank You for Your Feedback'
    }

    const feedbackSubtitles: Record<number, string> = {
      1: 'We\'re sorry your experience wasn\'t great. Please let us know what went wrong so we can make it right.',
      2: 'We appreciate your honest feedback. Please tell us how we can do better.',
      3: 'We value your input! Is there anything we could improve?',
      4: 'We\'re glad you had a good experience! Any suggestions for how we could be even better?'
    }

    const title = feedbackTitles[rating] || feedbackTitles[3]
    const subtitle = feedbackSubtitles[rating] || feedbackSubtitles[3]

    return new Response(
      generateThankYouPage(title, subtitle, true, emailLogId, actualAccountId || '', rating),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      }
    )

  } catch (error: any) {
    console.error('Star rating error:', error)
    return new Response(
      generateThankYouPage('Thank You!', 'We appreciate your feedback!', false, '', '', 0),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      }
    )
  }
})

function generateThankYouPage(
  title: string,
  message: string,
  showFeedbackForm: boolean = false,
  emailLogId: string = '',
  accountId: string = '',
  rating: number = 0
): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const submitFeedbackUrl = `${supabaseUrl}/functions/v1/submit-feedback`

  const starDisplay = rating > 0 ? '&#9733;'.repeat(rating) + '&#9734;'.repeat(5 - rating) : '&#11088;'

  const feedbackFormHtml = showFeedbackForm ? `
    <form id="feedbackForm" style="margin-top: 20px;">
      <textarea
        id="feedback"
        placeholder="Please share your thoughts with us..."
        style="
          width: 100%;
          min-height: 120px;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          font-size: 16px;
          font-family: inherit;
          resize: vertical;
          margin-bottom: 16px;
          transition: border-color 0.2s;
        "
        onfocus="this.style.borderColor='#667eea'"
        onblur="this.style.borderColor='#e2e8f0'"
      ></textarea>
      <button
        type="submit"
        style="
          width: 100%;
          padding: 16px 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        "
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 20px rgba(102, 126, 234, 0.3)'"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'"
      >
        Submit Feedback
      </button>
    </form>
    <div id="thankYouMessage" style="display: none; margin-top: 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">&#10004;</div>
      <p style="color: #48bb78; font-weight: 600;">Thank you for your feedback!</p>
      <p class="close-note">A member of our team may reach out to you.</p>
    </div>
    <script>
      document.getElementById('feedbackForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const feedback = document.getElementById('feedback').value.trim();
        if (!feedback) {
          alert('Please enter your feedback before submitting.');
          return;
        }

        const button = this.querySelector('button');
        button.disabled = true;
        button.textContent = 'Submitting...';

        try {
          const response = await fetch('${submitFeedbackUrl}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emailLogId: '${emailLogId}',
              accountId: '${accountId}',
              feedback: feedback
            })
          });

          if (response.ok) {
            document.getElementById('feedbackForm').style.display = 'none';
            document.getElementById('thankYouMessage').style.display = 'block';
          } else {
            throw new Error('Failed to submit');
          }
        } catch (err) {
          button.disabled = false;
          button.textContent = 'Submit Feedback';
          alert('Failed to submit feedback. Please try again.');
        }
      });
    </script>
  ` : `<p class="close-note">You may close this window.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 50px 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .stars {
      font-size: 36px;
      color: #fbbf24;
      margin-bottom: 20px;
      letter-spacing: 4px;
    }
    h1 {
      color: #1a1a2e;
      font-size: 24px;
      margin-bottom: 12px;
      font-weight: 700;
    }
    p {
      color: #4a5568;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .close-note {
      color: #718096;
      font-size: 13px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="stars">${starDisplay}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${feedbackFormHtml}
  </div>
</body>
</html>`
}
