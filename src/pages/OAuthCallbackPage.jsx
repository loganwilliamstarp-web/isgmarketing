// src/pages/OAuthCallbackPage.jsx
// Handles OAuth callback in popup window and communicates result to parent

import React, { useEffect, useState } from 'react';

const OAuthCallbackPage = () => {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing authentication...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    const provider = params.get('provider');
    const error = params.get('error');

    if (oauthResult === 'success') {
      setStatus('success');
      setMessage(`Successfully connected to ${provider === 'gmail' ? 'Gmail' : 'Microsoft 365'}!`);

      // Send message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_complete',
          success: true,
          provider
        }, '*');

        // Close popup after short delay
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        // Not in popup, redirect to settings
        setTimeout(() => {
          window.location.href = '/settings?tab=integrations';
        }, 1500);
      }
    } else if (oauthResult === 'error' || error) {
      setStatus('error');
      setMessage(error || 'Authentication failed. Please try again.');

      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_complete',
          success: false,
          error: error || 'Authentication failed'
        }, '*');

        // Close popup after delay so user can see error
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    } else {
      // No oauth params, might be initial load or error
      setStatus('error');
      setMessage('Invalid callback. Please try again.');
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        maxWidth: '400px'
      }}>
        {status === 'processing' && (
          <>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid #e0e0e0',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }} />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </>
        )}

        {status === 'success' && (
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#10b981',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#ef4444',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}

        <h2 style={{
          margin: '0 0 8px',
          fontSize: '20px',
          fontWeight: '600',
          color: '#1f2937'
        }}>
          {status === 'processing' ? 'Processing...' :
           status === 'success' ? 'Connected!' :
           'Connection Failed'}
        </h2>

        <p style={{
          margin: 0,
          fontSize: '14px',
          color: '#6b7280'
        }}>
          {message}
        </p>

        {status !== 'processing' && (
          <p style={{
            margin: '16px 0 0',
            fontSize: '12px',
            color: '#9ca3af'
          }}>
            This window will close automatically...
          </p>
        )}
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
