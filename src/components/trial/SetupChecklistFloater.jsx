// src/components/trial/SetupChecklistFloater.jsx
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useVerifiedSenderDomains } from '../../hooks/useSenderDomains';
import { useQuery } from '@tanstack/react-query';
import { emailOAuthService } from '../../services/emailOAuth';

const SetupChecklistFloater = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { isTrialUser, isTrialExpired, trialInfo, isAgencyAdmin, user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(() => {
    // Check if user has dismissed the checklist
    const dismissed = localStorage.getItem('isg_setup_checklist_dismissed');
    return dismissed === 'true';
  });

  // Fetch user settings to check signature
  const { data: userSettings, isLoading: loadingSettings } = useUserSettings();

  // Fetch verified domains (for agency admins)
  const { data: verifiedDomains, isLoading: loadingDomains } = useVerifiedSenderDomains();

  // Fetch OAuth connections (using user's id as ownerId)
  const { data: oauthConnections, isLoading: loadingOAuth } = useQuery({
    queryKey: ['oauth-connections', user?.id],
    queryFn: () => emailOAuthService.getConnections(user?.id),
    enabled: !!user?.id,
    staleTime: 30 * 1000 // 30 seconds - refresh quickly after connecting
  });

  // Determine completion status of each task
  const hasVerifiedDomain = (verifiedDomains?.length || 0) > 0;
  const hasSignature = !!(userSettings?.signature_html || userSettings?.signature_name);
  const hasOAuthConnection = !!(
    (oauthConnections?.gmail?.status === 'active') ||
    (oauthConnections?.microsoft?.status === 'active')
  );
  const hasBusinessInfo = !!(userSettings?.agency_name && userSettings?.agency_address && userSettings?.agency_phone);

  // Build checklist items based on user role
  const checklistItems = [];

  // Domain verification - only for agency admins
  if (isAgencyAdmin) {
    checklistItems.push({
      id: 'domain',
      label: 'Verify sender domain',
      completed: hasVerifiedDomain,
      description: 'Required to send emails',
      onClick: () => navigate(`/${userId}/settings`, { state: { scrollTo: 'domains' } })
    });

    // Business information - only for agency admins
    checklistItems.push({
      id: 'business',
      label: 'Complete business information',
      completed: hasBusinessInfo,
      description: 'Name, address & phone',
      onClick: () => navigate(`/${userId}/settings`, { state: { scrollTo: 'agency-info' } })
    });
  }

  // Signature - for everyone
  checklistItems.push({
    id: 'signature',
    label: 'Set up email signature',
    completed: hasSignature,
    description: 'Personalize your emails',
    onClick: () => navigate(`/${userId}/settings`, { state: { scrollTo: 'signature' } })
  });

  // OAuth connection - for everyone
  checklistItems.push({
    id: 'oauth',
    label: 'Connect Gmail or Microsoft 365',
    completed: hasOAuthConnection,
    description: 'Improves deliverability',
    onClick: () => navigate(`/${userId}/settings`, { state: { scrollTo: 'email-connection' } })
  });

  // Calculate completion
  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;
  const allComplete = completedCount === totalCount;

  // Don't show if dismissed or all complete (and not a trial user who needs to see days remaining)
  const isLoading = loadingSettings || loadingDomains || loadingOAuth;
  if (isLoading) return null;
  if (isDismissed && allComplete) return null;
  if (allComplete && !isTrialUser) return null;
  if (isTrialExpired) return null; // Trial expired banner handles this

  const handleDismiss = () => {
    if (allComplete) {
      localStorage.setItem('isg_setup_checklist_dismissed', 'true');
      setIsDismissed(true);
    }
  };

  const daysLeft = trialInfo?.daysLeft;
  const isUrgent = daysLeft && daysLeft <= 7;

  const styles = {
    container: {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '14px',
      width: '320px',
      overflow: 'hidden',
      border: '1px solid #e2e8f0',
    },
    trialHeader: {
      backgroundColor: isUrgent ? '#f59e0b' : '#3b82f6',
      color: '#ffffff',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
    },
    trialText: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    daysCount: {
      fontWeight: '700',
      fontSize: '16px',
    },
    header: {
      padding: '12px 16px',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      cursor: 'pointer',
      backgroundColor: '#f8fafc',
    },
    headerTitle: {
      fontWeight: '600',
      color: '#1e293b',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    progressBadge: {
      backgroundColor: allComplete ? '#dcfce7' : '#dbeafe',
      color: allComplete ? '#16a34a' : '#2563eb',
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '12px',
      fontWeight: '500',
    },
    expandIcon: {
      color: '#64748b',
      fontSize: '12px',
      transition: 'transform 0.2s',
      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
    },
    content: {
      padding: isExpanded ? '8px 0' : '0',
      maxHeight: isExpanded ? '300px' : '0',
      overflow: 'hidden',
      transition: 'all 0.2s ease-in-out',
    },
    item: {
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
    },
    itemHover: {
      backgroundColor: '#f1f5f9',
    },
    checkbox: {
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      border: '2px solid',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: '12px',
      marginTop: '2px',
    },
    checkboxComplete: {
      borderColor: '#16a34a',
      backgroundColor: '#16a34a',
      color: '#ffffff',
    },
    checkboxIncomplete: {
      borderColor: '#cbd5e1',
      backgroundColor: '#ffffff',
    },
    itemContent: {
      flex: 1,
    },
    itemLabel: {
      fontWeight: '500',
      color: '#1e293b',
      marginBottom: '2px',
    },
    itemLabelComplete: {
      color: '#64748b',
      textDecoration: 'line-through',
    },
    itemDescription: {
      fontSize: '12px',
      color: '#64748b',
    },
    arrow: {
      color: '#94a3b8',
      fontSize: '14px',
      marginTop: '2px',
    },
    dismissButton: {
      padding: '8px 16px',
      textAlign: 'center',
      color: '#64748b',
      fontSize: '12px',
      cursor: 'pointer',
      borderTop: '1px solid #e2e8f0',
      display: allComplete ? 'block' : 'none',
    },
  };

  return (
    <div style={styles.container}>
      {/* Trial status header - only for trial users */}
      {isTrialUser && trialInfo && (
        <div style={styles.trialHeader}>
          <div style={styles.trialText}>
            <span>{isUrgent ? '⚠️' : '⏱️'}</span>
            <span>
              <span style={styles.daysCount}>{daysLeft}</span>{' '}
              {daysLeft === 1 ? 'day' : 'days'} left in trial
            </span>
          </div>
        </div>
      )}

      {/* Checklist header */}
      <div
        style={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={styles.headerTitle}>
          <span>Setup Checklist</span>
          <span style={styles.progressBadge}>
            {completedCount}/{totalCount}
          </span>
        </div>
        <span style={styles.expandIcon}>▼</span>
      </div>

      {/* Checklist items */}
      <div style={styles.content}>
        {checklistItems.map((item) => (
          <div
            key={item.id}
            style={styles.item}
            onClick={item.onClick}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <div style={{
              ...styles.checkbox,
              ...(item.completed ? styles.checkboxComplete : styles.checkboxIncomplete)
            }}>
              {item.completed && '✓'}
            </div>
            <div style={styles.itemContent}>
              <div style={{
                ...styles.itemLabel,
                ...(item.completed ? styles.itemLabelComplete : {})
              }}>
                {item.label}
              </div>
              <div style={styles.itemDescription}>{item.description}</div>
            </div>
            {!item.completed && <span style={styles.arrow}>→</span>}
          </div>
        ))}

        {/* Dismiss button when all complete */}
        {allComplete && (
          <div
            style={styles.dismissButton}
            onClick={handleDismiss}
          >
            Dismiss
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupChecklistFloater;
