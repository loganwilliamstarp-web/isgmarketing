// src/pages/UnsubscribePage.jsx
// Public page for handling email unsubscribe requests
// Accessed via unsubscribe link in email footer

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

// Create an anonymous Supabase client for public unsubscribe
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading, success, already, error
  const [error, setError] = useState(null);

  // Get params from URL
  const emailLogId = searchParams.get('id') || '';
  const email = searchParams.get('email') || '';

  useEffect(() => {
    const processUnsubscribe = async () => {
      // Validate required params
      if (!emailLogId || !email) {
        setStatus('error');
        setError('Invalid unsubscribe link. Missing required parameters.');
        return;
      }

      try {
        // First check if already unsubscribed
        const { data: existing } = await supabasePublic
          .from('unsubscribes')
          .select('id')
          .ilike('email', email.trim())
          .eq('unsubscribe_type', 'all')
          .eq('is_active', true)
          .limit(1);

        if (existing && existing.length > 0) {
          setStatus('already');
          return;
        }

        // Get email log info for context
        const { data: emailLog, error: logError } = await supabasePublic
          .from('email_logs')
          .select('id, to_email, owner_id, account_id')
          .eq('id', emailLogId)
          .single();

        if (logError) {
          console.error('Error fetching email log:', logError);
          // Still try to unsubscribe even if we can't find the log
        }

        // Insert unsubscribe record
        const { error: insertError } = await supabasePublic
          .from('unsubscribes')
          .insert({
            email: email.trim().toLowerCase(),
            unsubscribe_type: 'all',
            source: 'link_click',
            email_log_id: emailLogId ? parseInt(emailLogId, 10) : null,
            is_active: true
          });

        if (insertError) {
          // Check if it's a duplicate (already unsubscribed)
          if (insertError.code === '23505') {
            setStatus('already');
            return;
          }
          throw insertError;
        }

        // Log activity (best effort)
        if (emailLog?.owner_id) {
          try {
            await supabasePublic
              .from('activity_log')
              .insert({
                owner_id: emailLog.owner_id,
                event_type: 'unsubscribe',
                event_category: 'engagement',
                title: 'Contact unsubscribed',
                description: `${email} unsubscribed via email link`,
                email_log_id: parseInt(emailLogId, 10),
                account_id: emailLog.account_id,
                actor_type: 'customer',
                severity: 'warning',
                created_at: new Date().toISOString()
              });
          } catch (activityErr) {
            console.error('Error logging activity:', activityErr);
            // Non-critical, continue
          }
        }

        // Update the email_logs status
        if (emailLogId) {
          try {
            await supabasePublic
              .from('email_logs')
              .update({
                status: 'Unsubscribed',
                unsubscribed_at: new Date().toISOString()
              })
              .eq('id', emailLogId);
          } catch (updateErr) {
            console.error('Error updating email log:', updateErr);
            // Non-critical, continue
          }
        }

        setStatus('success');
      } catch (err) {
        console.error('Unsubscribe error:', err);
        setStatus('error');
        setError('Something went wrong. Please try again or contact support.');
      }
    };

    processUnsubscribe();
  }, [emailLogId, email]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid #e2e8f0',
              borderTopColor: '#667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h1 style={{
              color: '#1a1a2e',
              fontSize: '24px',
              marginBottom: '12px',
              fontWeight: '700'
            }}>
              Processing...
            </h1>
            <p style={{
              color: '#4a5568',
              fontSize: '15px',
              lineHeight: '1.6'
            }}>
              Please wait while we process your request.
            </p>
          </>
        );

      case 'success':
        return (
          <>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px'
            }}>
              ✓
            </div>
            <h1 style={{
              color: '#1a1a2e',
              fontSize: '24px',
              marginBottom: '12px',
              fontWeight: '700'
            }}>
              You've Been Unsubscribed
            </h1>
            <p style={{
              color: '#4a5568',
              fontSize: '15px',
              lineHeight: '1.6',
              marginBottom: '8px'
            }}>
              You will no longer receive marketing emails from us.
            </p>
            <p style={{
              color: '#718096',
              fontSize: '13px',
              marginTop: '24px'
            }}>
              You may close this window.
            </p>
          </>
        );

      case 'already':
        return (
          <>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px'
            }}>
              ✓
            </div>
            <h1 style={{
              color: '#1a1a2e',
              fontSize: '24px',
              marginBottom: '12px',
              fontWeight: '700'
            }}>
              Already Unsubscribed
            </h1>
            <p style={{
              color: '#4a5568',
              fontSize: '15px',
              lineHeight: '1.6'
            }}>
              This email address is already unsubscribed from our mailing list.
            </p>
            <p style={{
              color: '#718096',
              fontSize: '13px',
              marginTop: '24px'
            }}>
              You may close this window.
            </p>
          </>
        );

      case 'error':
        return (
          <>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px'
            }}>
              ⚠️
            </div>
            <h1 style={{
              color: '#1a1a2e',
              fontSize: '24px',
              marginBottom: '12px',
              fontWeight: '700'
            }}>
              Unable to Unsubscribe
            </h1>
            <p style={{
              color: '#e53e3e',
              fontSize: '15px',
              lineHeight: '1.6'
            }}>
              {error || 'Something went wrong. Please try again later.'}
            </p>
            <p style={{
              color: '#718096',
              fontSize: '13px',
              marginTop: '24px'
            }}>
              If this problem persists, please contact us directly.
            </p>
          </>
        );

      default:
        return null;
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
        {renderContent()}
      </div>
    </div>
  );
};

export default UnsubscribePage;
