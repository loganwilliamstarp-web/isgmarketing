// src/components/trial/TrialSignupPopup.jsx
import React, { useState, useEffect } from 'react';
import { trialService } from '../../services/trial';

const TrialSignupPopup = ({ email, onStartTrial, onCancel }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPersonalEmail, setIsPersonalEmail] = useState(false);

  // Check if email is a personal email on mount
  useEffect(() => {
    if (email) {
      const validation = trialService.validateTrialEmail(email);
      if (!validation.valid) {
        setIsPersonalEmail(true);
        setError(validation.reason);
      }
    }
  }, [email]);

  const handleStartTrial = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await onStartTrial();
      if (result && !result.success) {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message || 'Failed to start trial');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '20px',
    },
    card: {
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      padding: '48px',
      width: '100%',
      maxWidth: '520px',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      marginBottom: '32px',
    },
    logoIcon: {
      width: '48px',
      height: '48px',
      backgroundColor: '#3b82f6',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '24px',
    },
    logoText: {
      fontWeight: '700',
      fontSize: '20px',
      color: '#1e293b',
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#1e293b',
      textAlign: 'center',
      marginBottom: '8px',
    },
    subtitle: {
      fontSize: '14px',
      color: '#64748b',
      textAlign: 'center',
      marginBottom: '32px',
      lineHeight: '1.6',
    },
    errorSection: {
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '24px',
    },
    errorTitle: {
      fontSize: '15px',
      fontWeight: '600',
      color: '#dc2626',
      marginBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    errorText: {
      fontSize: '14px',
      color: '#7f1d1d',
      lineHeight: '1.5',
    },
    featuresSection: {
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
    },
    featuresTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#1e293b',
      marginBottom: '16px',
    },
    featuresList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    featureItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '14px',
      color: '#475569',
    },
    featureIcon: {
      width: '20px',
      height: '20px',
      backgroundColor: '#dcfce7',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      flexShrink: 0,
    },
    pricingSection: {
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '24px',
      textAlign: 'center',
    },
    pricingLabel: {
      fontSize: '13px',
      color: '#64748b',
      marginBottom: '4px',
    },
    pricingAmount: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#1e293b',
    },
    pricingPeriod: {
      fontSize: '14px',
      color: '#64748b',
    },
    trialBadge: {
      display: 'inline-block',
      backgroundColor: '#dbeafe',
      color: '#1d4ed8',
      fontSize: '12px',
      fontWeight: '600',
      padding: '4px 12px',
      borderRadius: '20px',
      marginTop: '12px',
    },
    buttonPrimary: {
      width: '100%',
      padding: '14px 24px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#ffffff',
      backgroundColor: '#3b82f6',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      marginBottom: '12px',
    },
    buttonPrimaryDisabled: {
      backgroundColor: '#94a3b8',
      cursor: 'not-allowed',
    },
    buttonSecondary: {
      width: '100%',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#64748b',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'color 0.2s',
    },
    footer: {
      marginTop: '24px',
      textAlign: 'center',
      fontSize: '13px',
      color: '#94a3b8',
      lineHeight: '1.5',
    },
    emailDisplay: {
      backgroundColor: '#f1f5f9',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      color: '#475569',
      marginBottom: '24px',
      textAlign: 'center',
    },
  };

  const features = [
    'Automated email workflows',
    'Pre-built email templates',
    'Mass email campaigns',
    'Real-time analytics & tracking',
    'Star rating collection',
    'Google review integration',
  ];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>📧</div>
          <div style={styles.logoText}>Email Automation</div>
        </div>

        <h1 style={styles.title}>Welcome to ISG Marketing</h1>
        <p style={styles.subtitle}>
          Streamline your client communications with powerful<br />
          email automation tools built for insurance professionals.
        </p>

        {email && (
          <div style={styles.emailDisplay}>
            Signing up as: <strong>{email}</strong>
          </div>
        )}

        {isPersonalEmail ? (
          <div style={styles.errorSection}>
            <div style={styles.errorTitle}>
              <span>⚠️</span>
              Business Email Required
            </div>
            <div style={styles.errorText}>
              {error}
            </div>
          </div>
        ) : error ? (
          <div style={styles.errorSection}>
            <div style={styles.errorTitle}>
              <span>⚠️</span>
              Unable to Start Trial
            </div>
            <div style={styles.errorText}>
              {error}
            </div>
          </div>
        ) : null}

        <div style={styles.featuresSection}>
          <div style={styles.featuresTitle}>Everything you need to engage clients:</div>
          <div style={styles.featuresList}>
            {features.map((feature, index) => (
              <div key={index} style={styles.featureItem}>
                <div style={styles.featureIcon}>✓</div>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.pricingSection}>
          <div style={styles.pricingLabel}>After your trial</div>
          <div>
            <span style={styles.pricingAmount}>$199</span>
            <span style={styles.pricingPeriod}> / month</span>
          </div>
          <div style={styles.trialBadge}>30-Day Free Trial</div>
        </div>

        {!isPersonalEmail && (
          <button
            onClick={handleStartTrial}
            disabled={isLoading}
            style={{
              ...styles.buttonPrimary,
              ...(isLoading ? styles.buttonPrimaryDisabled : {}),
            }}
          >
            {isLoading ? 'Starting Trial...' : 'Start Your 30-Day Free Trial'}
          </button>
        )}

        <button
          onClick={onCancel}
          disabled={isLoading}
          style={styles.buttonSecondary}
        >
          {isPersonalEmail ? 'Sign In With a Business Email' : 'Use a Different Email'}
        </button>

        <div style={styles.footer}>
          Questions? Contact your ISG administrator.
        </div>
      </div>
    </div>
  );
};

export default TrialSignupPopup;
