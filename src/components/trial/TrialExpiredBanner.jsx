// src/components/trial/TrialExpiredBanner.jsx
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const TrialExpiredBanner = () => {
  const { isTrialExpired } = useAuth();

  // Only show for users with expired trial
  if (!isTrialExpired) return null;

  const styles = {
    container: {
      backgroundColor: '#dc2626',
      color: '#ffffff',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '14px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    icon: {
      fontSize: '16px',
      flexShrink: 0,
    },
    text: {
      fontWeight: '500',
    },
    highlight: {
      fontWeight: '600',
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>⚠️</span>
      <span style={styles.text}>
        <span style={styles.highlight}>Your trial has expired.</span>{' '}
        Contact your administrator to activate your account and continue using all features.
      </span>
    </div>
  );
};

export default TrialExpiredBanner;
