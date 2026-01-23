// src/components/trial/TrialStatusFloater.jsx
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const TrialStatusFloater = () => {
  const { isTrialUser, trialInfo } = useAuth();

  // Only show for users with active trial (not for full access or expired)
  if (!isTrialUser || !trialInfo) return null;

  const daysLeft = trialInfo.daysLeft;
  const isUrgent = daysLeft <= 7;

  const styles = {
    container: {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      backgroundColor: isUrgent ? '#f59e0b' : '#3b82f6',
      color: '#ffffff',
      padding: '14px 20px',
      borderRadius: '10px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '14px',
      maxWidth: '320px',
    },
    icon: {
      fontSize: '20px',
      flexShrink: 0,
    },
    text: {
      lineHeight: '1.4',
    },
    daysCount: {
      fontWeight: '700',
      fontSize: '16px',
    },
    label: {
      opacity: 0.9,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>{isUrgent ? '⚠️' : '⏱️'}</span>
      <div style={styles.text}>
        <span style={styles.daysCount}>{daysLeft}</span>{' '}
        <span style={styles.label}>
          {daysLeft === 1 ? 'day' : 'days'} left in your trial
        </span>
      </div>
    </div>
  );
};

export default TrialStatusFloater;
