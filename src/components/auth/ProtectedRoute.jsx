// src/components/auth/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth';

const ProtectedRoute = ({ children }) => {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ color: '#64748b', fontSize: '14px' }}>Loading...</div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Check if we're in a Salesforce iframe - don't redirect, show inline error
    const sfContext = authService.detectSalesforceContext();
    if (sfContext.isInIframe && sfContext.isSalesforceReferrer) {
      // In Salesforce but user not enabled - show trial/pricing page
      const baseUrl = window.location.origin;
      const features = [
        'Automated email workflows',
        'Pre-built email templates',
        'Mass email campaigns',
        'Real-time analytics & tracking',
        'Star rating collection',
        'Google review integration',
      ];
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '48px',
            width: '100%',
            maxWidth: '520px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
              <div style={{
                width: '48px', height: '48px', backgroundColor: '#3b82f6', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px',
              }}>📧</div>
              <div style={{ fontWeight: '700', fontSize: '20px', color: '#1e293b' }}>Email Automation</div>
            </div>

            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: '8px' }}>
              Welcome to ISG Marketing
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '32px', lineHeight: '1.6' }}>
              Streamline your client communications with powerful<br />
              email automation tools built for insurance professionals.
            </p>

            <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                Everything you need to engage clients:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {features.map((feature, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#475569' }}>
                    <div style={{
                      width: '20px', height: '20px', backgroundColor: '#dcfce7', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0,
                    }}>✓</div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>After your trial</div>
              <div>
                <span style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>$199</span>
                <span style={{ fontSize: '14px', color: '#64748b' }}> / month</span>
              </div>
              <div style={{
                display: 'inline-block', backgroundColor: '#dbeafe', color: '#1d4ed8',
                fontSize: '12px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', marginTop: '12px',
              }}>30-Day Free Trial</div>
            </div>

            <a
              href={`${baseUrl}/login`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', width: '100%', padding: '14px 24px', fontSize: '16px', fontWeight: '600',
                color: '#ffffff', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px',
                cursor: 'pointer', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
                marginBottom: '12px',
              }}
            >
              Start Your 30-Day Free Trial
            </a>

            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
              Questions? Contact your ISG administrator.
            </div>
          </div>
        </div>
      );
    }

    // Normal web access - redirect to login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
