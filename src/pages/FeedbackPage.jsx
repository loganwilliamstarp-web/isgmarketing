// src/pages/FeedbackPage.jsx
// Public page for star rating thank-you and feedback collection
// Accessed via redirect from star-rating edge function

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

// Create an anonymous Supabase client for public feedback submission
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FeedbackPage = () => {
  const [searchParams] = useSearchParams();
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Get params from URL
  const rating = parseInt(searchParams.get('rating') || '0', 10);
  const emailLogId = searchParams.get('id') || '';
  const accountId = searchParams.get('account') || '';
  const showForm = searchParams.get('feedback') === 'true';
  const status = searchParams.get('status') || 'success'; // success, error, invalid

  // Title and message based on rating
  const getContent = () => {
    if (status === 'invalid') {
      return {
        title: 'Invalid Link',
        message: 'Sorry, this rating link appears to be invalid or has expired.'
      };
    }

    if (status === 'error') {
      return {
        title: 'Thank You!',
        message: 'We appreciate your feedback!'
      };
    }

    if (rating >= 4) {
      return {
        title: 'Thank You for Your Positive Feedback!',
        message: `We're thrilled to hear you had a great experience with us! Your ${rating}-star rating means the world to us.`
      };
    }

    const titles = {
      1: "We'd Love to Hear From You",
      2: 'Help Us Improve',
      3: 'Share Your Thoughts'
    };

    const messages = {
      1: "We're sorry your experience wasn't great. Please let us know what went wrong so we can make it right.",
      2: 'We appreciate your honest feedback. Please tell us how we can do better.',
      3: 'We value your input! Is there anything we could improve?'
    };

    return {
      title: titles[rating] || 'Thank You!',
      message: messages[rating] || 'We appreciate your feedback!'
    };
  };

  const { title, message } = getContent();

  // Generate star display
  const renderStars = () => {
    if (rating <= 0) return '⭐';
    return (
      <span>
        {'★'.repeat(rating)}
        {'☆'.repeat(5 - rating)}
      </span>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError('Please enter your feedback before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Update account with feedback text directly via Supabase client
      if (accountId) {
        const { error: updateError } = await supabasePublic
          .from('accounts')
          .update({
            survey_feedback_text: feedback.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('account_unique_id', accountId);

        if (updateError) {
          console.error('Error updating account:', updateError);
          // Don't throw - we still want to show success even if logging fails
        }
      }

      // Log activity (best effort - don't block on failure)
      if (emailLogId) {
        try {
          // Get email log info for activity logging
          const { data: emailLog } = await supabasePublic
            .from('email_logs')
            .select('owner_id, account_id')
            .eq('id', emailLogId)
            .single();

          if (emailLog) {
            await supabasePublic
              .from('activity_log')
              .insert({
                owner_id: emailLog.owner_id,
                event_type: 'survey_feedback',
                event_category: 'engagement',
                title: 'Customer left feedback',
                description: feedback.trim().substring(0, 200) + (feedback.trim().length > 200 ? '...' : ''),
                email_log_id: parseInt(emailLogId, 10),
                account_id: accountId || emailLog.account_id,
                actor_type: 'customer',
                severity: 'warning',
                metadata: { feedback_length: feedback.trim().length },
                created_at: new Date().toISOString()
              });
          }
        } catch (logErr) {
          console.error('Error logging activity:', logErr);
          // Don't throw - activity logging is non-critical
        }
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '50px 40px',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Stars */}
        <div style={{
          fontSize: '36px',
          color: '#fbbf24',
          marginBottom: '20px',
          letterSpacing: '4px'
        }}>
          {renderStars()}
        </div>

        {/* Title */}
        <h1 style={{
          color: '#1a1a2e',
          fontSize: '24px',
          marginBottom: '12px',
          fontWeight: '700'
        }}>
          {title}
        </h1>

        {/* Message */}
        <p style={{
          color: '#4a5568',
          fontSize: '15px',
          lineHeight: '1.6',
          marginBottom: '20px'
        }}>
          {message}
        </p>

        {/* Feedback Form */}
        {showForm && !submitted && (
          <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Please share your thoughts with us..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '16px',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />
            {error && (
              <p style={{ color: '#e53e3e', fontSize: '14px', marginBottom: '12px' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '16px 32px',
                background: submitting
                  ? '#a0aec0'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}

        {/* Thank You Message after submission */}
        {submitted && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
            <p style={{ color: '#48bb78', fontWeight: '600' }}>
              Thank you for your feedback!
            </p>
            <p style={{ color: '#718096', fontSize: '13px', marginTop: '20px' }}>
              A member of our team may reach out to you.
            </p>
          </div>
        )}

        {/* Close note when no form or after submission */}
        {(!showForm || submitted) && (
          <p style={{ color: '#718096', fontSize: '13px', marginTop: '20px' }}>
            You may close this window.
          </p>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;
