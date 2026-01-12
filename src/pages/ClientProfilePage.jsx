import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useAccountWithPolicies,
  useAccountWithEmailHistory,
  useAccountEmailLogs,
  useAccountActivity,
  useAccountEnrollments,
  useQuickStats,
  useScheduledEmailMutations
} from '../hooks';
import ComposeEmailModal from '../components/ComposeEmailModal';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Status badge
const StatusBadge = ({ status, theme: t }) => {
  const colors = {
    active: { bg: `${t.success}20`, text: t.success },
    pending: { bg: `${t.warning}20`, text: t.warning },
    cancelled: { bg: `${t.danger}20`, text: t.danger },
    expired: { bg: `${t.textMuted}20`, text: t.textMuted },
  };
  const c = colors[status] || colors.pending;
  
  return (
    <span style={{
      padding: '4px 10px',
      backgroundColor: c.bg,
      color: c.text,
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '500',
      textTransform: 'capitalize'
    }}>
      {status}
    </span>
  );
};

// Email event badge
const EmailEventBadge = ({ event, theme: t }) => {
  const icons = {
    sent: '📤',
    delivered: '✅',
    opened: '📬',
    clicked: '🖱️',
    replied: null, // Use text only for replied
    bounced: '❌',
    unsubscribed: '🚫'
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      backgroundColor: t.bgHover,
      borderRadius: '4px',
      fontSize: '11px',
      color: t.textSecondary
    }}>
      {icons[event] ? `${icons[event]} ` : ''}{event}
    </span>
  );
};

// Policy card
const PolicyCard = ({ policy, theme: t }) => {
  const daysUntilExpiry = policy.expiration_date 
    ? Math.ceil((new Date(policy.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  
  const policyType = policy.policy_lob || policy.policy_type || 'Unknown';
  const policyStatus = policy.policy_status || policy.status || 'unknown';
  const carrierName = policy.carrier?.name || policy.carrier_name || policy.carrier || '—';

  return (
    <div style={{
      padding: '16px',
      backgroundColor: t.bg,
      borderRadius: '10px',
      border: `1px solid ${t.border}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{
          padding: '8px 12px',
          backgroundColor: `${t.primary}15`,
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: t.primary
        }}>
          {policyType}
        </div>
        <StatusBadge status={policyStatus.toLowerCase()} theme={t} />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
        <div>
          <div style={{ color: t.textMuted, fontSize: '11px', marginBottom: '2px' }}>Policy Number</div>
          <div style={{ color: t.text }}>{policy.policy_number || '—'}</div>
        </div>
        <div>
          <div style={{ color: t.textMuted, fontSize: '11px', marginBottom: '2px' }}>Carrier</div>
          <div style={{ color: t.text }}>{carrierName}</div>
        </div>
        <div>
          <div style={{ color: t.textMuted, fontSize: '11px', marginBottom: '2px' }}>Effective Date</div>
          <div style={{ color: t.text }}>
            {policy.effective_date ? new Date(policy.effective_date).toLocaleDateString() : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: t.textMuted, fontSize: '11px', marginBottom: '2px' }}>Expiration</div>
          <div style={{
            color: daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30 ? t.warning : t.text
          }}>
            {policy.expiration_date ? (
              <>
                {new Date(policy.expiration_date).toLocaleDateString()}
                {daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30 && (
                  <span style={{ fontSize: '11px', marginLeft: '6px' }}>
                    ({daysUntilExpiry}d left)
                  </span>
                )}
              </>
            ) : '—'}
          </div>
        </div>
      </div>
      
      {(policy.premium || policy.annual_premium) && (
        <div style={{ 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '12px', color: t.textMuted }}>Annual Premium</span>
          <span style={{ fontSize: '16px', fontWeight: '600', color: t.success }}>
            ${(policy.premium || policy.annual_premium).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

// Email log item
const EmailLogItem = ({ log, theme: t }) => (
  <div style={{
    padding: '14px',
    backgroundColor: t.bg,
    borderRadius: '8px',
    border: `1px solid ${t.border}`,
    marginBottom: '8px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>
          {log.email_templates?.name || 'Direct Email'}
        </div>
        <div style={{ fontSize: '12px', color: t.textSecondary, marginTop: '2px' }}>
          {log.subject}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px', color: t.textMuted }}>
          {new Date(log.sent_at).toLocaleDateString()} at{' '}
          {new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <EmailEventBadge event="sent" theme={t} />
      {log.delivered_at && <EmailEventBadge event="delivered" theme={t} />}
      {log.first_opened_at && <EmailEventBadge event="opened" theme={t} />}
      {log.first_clicked_at && <EmailEventBadge event="clicked" theme={t} />}
      {log.first_replied_at && <EmailEventBadge event="replied" theme={t} />}
      {log.bounced_at && <EmailEventBadge event="bounced" theme={t} />}
    </div>
  </div>
);

// Activity item
const ActivityItem = ({ activity, theme: t }) => {
  const icons = {
    email_sent: '📤',
    email_opened: '📬',
    email_clicked: '🖱️',
    email_reply_received: null, // Use text label instead
    enrollment_started: '▶️',
    enrollment_completed: '✅',
    enrollment_paused: '⏸️',
    note_added: '📝',
  };

  const textLabels = {
    email_reply_received: 'RE'
  };

  const icon = icons[activity.event_type];
  const textLabel = textLabels[activity.event_type];

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px 0' }}>
      <div style={{
        width: '32px',
        height: '32px',
        backgroundColor: t.bgHover,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: textLabel ? '11px' : '14px',
        fontWeight: textLabel ? '600' : 'normal',
        color: textLabel ? t.textSecondary : 'inherit'
      }}>
        {icon || textLabel || '📌'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: t.text }}>
          {activity.description}
        </div>
        <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>
          {new Date(activity.created_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

// Enrollment card
const EnrollmentCard = ({ enrollment, theme: t, userId }) => (
  <div style={{
    padding: '14px',
    backgroundColor: t.bg,
    borderRadius: '8px',
    border: `1px solid ${t.border}`,
    marginBottom: '8px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <Link 
          to={`/${userId}/automations/${enrollment.automation_id}`}
          style={{ 
            fontSize: '14px', 
            fontWeight: '500', 
            color: t.text,
            textDecoration: 'none'
          }}
        >
          {enrollment.automation?.name || 'Unknown Automation'}
        </Link>
        <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>
          Started {new Date(enrollment.enrolled_at).toLocaleDateString()}
        </div>
      </div>
      <StatusBadge
        status={enrollment.status?.toLowerCase() || 'pending'}
        theme={t}
      />
    </div>
    {enrollment.current_node_id && (
      <div style={{ 
        marginTop: '10px', 
        padding: '8px 10px', 
        backgroundColor: t.bgHover, 
        borderRadius: '6px',
        fontSize: '12px',
        color: t.textSecondary
      }}>
        📍 Current step: {enrollment.current_node_name || enrollment.current_node_id}
      </div>
    )}
  </div>
);

// Main Client Profile Page Component
const ClientProfilePage = ({ t }) => {
  const { userId, accountId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [showComposeModal, setShowComposeModal] = useState(false);

  // Mutations for sending email
  const { sendDirectEmail } = useScheduledEmailMutations();

  // Primary data - always load
  const { data: client, isLoading, error } = useAccountWithPolicies(accountId);
  
  // Lazy load other data based on tab (or for overview stats)
  const { data: emailLogs, isLoading: logsLoading } = useAccountEmailLogs(
    activeTab === 'overview' || activeTab === 'emails' ? accountId : null
  );
  const { data: activities, isLoading: activitiesLoading } = useAccountActivity(
    activeTab === 'activity' ? accountId : null
  );
  const { data: enrollments, isLoading: enrollmentsLoading } = useAccountEnrollments(
    activeTab === 'overview' || activeTab === 'automations' ? accountId : null
  );
  
  // Don't load org stats on initial render - it's secondary info
  const { data: orgStats } = useQuickStats();

  // Calculate this account's stats
  const accountStats = {
    emailsSent: emailLogs?.length || 0,
    opened: emailLogs?.filter(l => l.first_opened_at).length || 0,
    clicked: emailLogs?.filter(l => l.first_clicked_at).length || 0,
    openRate: emailLogs?.length > 0 ? Math.round((emailLogs.filter(l => l.first_opened_at).length / emailLogs.length) * 100) : 0,
    clickRate: emailLogs?.length > 0 ? Math.round((emailLogs.filter(l => l.first_clicked_at).length / emailLogs.length) * 100) : 0,
    activeEnrollments: enrollments?.filter(e => e.status === 'Active').length || 0
  };

  // Org averages for comparison
  const orgAverages = {
    openRate: orgStats?.openRate || 25,
    clickRate: orgStats?.clickRate || 5
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton width="200px" height="32px" />
        <div style={{ marginTop: '20px' }}><Skeleton height="200px" /></div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <h2 style={{ color: t.text, marginBottom: '8px' }}>Account Not Found</h2>
        <p style={{ color: t.textSecondary, marginBottom: '24px' }}>
          We couldn't find the account you're looking for.
        </p>
        <button
          onClick={() => navigate(`/${userId}/accounts`)}
          style={{
            padding: '10px 20px',
            backgroundColor: t.primary,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Back to Accounts
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'emails', label: `Emails (${emailLogs?.length || 0})` },
    { id: 'automations', label: `Automations (${enrollments?.length || 0})` },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => navigate(`/${userId}/accounts`)}
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          ← Back to Accounts
        </button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
              {client.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {(() => {
                const rawStatus = (client.account_status || '').toLowerCase();
                // Handle variations like "prior_customer" -> "prior"
                  let status = rawStatus;
                  if (rawStatus === 'prior_customer' || rawStatus.startsWith('prior')) status = 'prior';
                  if (rawStatus.startsWith('customer')) status = 'customer';
                  if (rawStatus.startsWith('prospect')) status = 'prospect';
                  if (rawStatus.startsWith('lead')) status = 'lead';
                  
                  const statusColors = {
                    customer: { bg: `${t.success}20`, text: t.success, label: 'Customer' },
                    prospect: { bg: `${t.primary}20`, text: t.primary, label: 'Prospect' },
                    prior: { bg: `${t.textMuted}20`, text: t.textMuted, label: 'Prior Customer' },
                    lead: { bg: `${t.warning}20`, text: t.warning, label: 'Lead' },
                  };
                  const c = statusColors[status] || statusColors.prospect;
                  return (
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: c.bg,
                      color: c.text,
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {c.label}
                    </span>
                  );
                })()}
                {client.account_unique_id && (
                  <span style={{ fontSize: '12px', color: t.textMuted }}>
                    ID: {client.account_unique_id}
                  </span>
                )}
              </div>
            </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{
                padding: '10px 16px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📝 Add Note
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowComposeModal(true);
              }}
              style={{
                padding: '10px 16px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📧 Send Email
            </button>
          </div>
        </div>
      </div>

      {/* Contact Info Bar */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '16px 20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {(client.person_email || client.email) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📧</span>
            <a href={`mailto:${client.person_email || client.email}`} style={{ color: t.primary, textDecoration: 'none', fontSize: '14px' }}>
              {client.person_email || client.email}
            </a>
          </div>
        )}
        {client.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📱</span>
            <a href={`tel:${client.phone}`} style={{ color: t.text, textDecoration: 'none', fontSize: '14px' }}>
              {client.phone}
            </a>
          </div>
        )}
        {(client.billing_street || client.billing_city || client.billing_state) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📍</span>
            <span style={{ color: t.textSecondary, fontSize: '14px' }}>
              {[
                client.billing_street,
                [client.billing_city, client.billing_state].filter(Boolean).join(', '),
                client.billing_postal_code
              ].filter(Boolean).join(' • ')}
            </span>
          </div>
        )}
        {client.primary_contact_first_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>👤</span>
            <span style={{ color: t.textSecondary, fontSize: '14px' }}>
              {client.primary_contact_first_name} {client.primary_contact_last_name}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '24px',
        backgroundColor: t.bgHover,
        padding: '4px',
        borderRadius: '10px',
        width: 'fit-content'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab.id ? t.bgCard : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: activeTab === tab.id ? t.text : t.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Policies */}
          <div style={{
            padding: '20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px', flexShrink: 0 }}>
              Policies ({client.policies?.length || 0})
            </h3>
            {client.policies?.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                overflowY: 'auto',
                flex: 1,
                paddingRight: '8px'
              }}>
                {client.policies.map((policy, i) => (
                  <PolicyCard key={i} policy={policy} theme={t} />
                ))}
              </div>
            ) : (
              <div style={{ padding: '30px', textAlign: 'center', color: t.textMuted }}>
                No policies on file
              </div>
            )}
          </div>

          {/* Email Stats & Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Email Stats */}
            <div style={{
              padding: '20px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
                Email Engagement
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: t.primary }}>
                    {accountStats.emailsSent}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Sent</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: t.success }}>
                    {accountStats.opened}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Opened</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: t.warning }}>
                    {accountStats.clicked}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Clicked</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: t.danger }}>
                    {emailLogs?.filter(l => l.bounced_at).length || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Bounced</div>
                </div>
              </div>
            </div>

            {/* Comparison Analytics */}
            <div style={{
              padding: '20px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
                Compared to Average
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Open Rate Comparison */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: t.textSecondary }}>Open Rate</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: accountStats.openRate >= orgAverages.openRate ? t.success : t.danger }}>
                      {accountStats.openRate}%
                      {accountStats.openRate >= orgAverages.openRate ? ' ↑' : ' ↓'}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: '8px', backgroundColor: t.bgHover, borderRadius: '4px', overflow: 'hidden' }}>
                    {/* Average marker */}
                    <div style={{
                      position: 'absolute',
                      left: `${Math.min(orgAverages.openRate, 100)}%`,
                      top: 0,
                      width: '2px',
                      height: '100%',
                      backgroundColor: t.textMuted,
                      zIndex: 2
                    }} />
                    {/* Account's rate */}
                    <div style={{
                      width: `${Math.min(accountStats.openRate, 100)}%`,
                      height: '100%',
                      backgroundColor: accountStats.openRate >= orgAverages.openRate ? t.success : t.warning,
                      borderRadius: '4px',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>0%</span>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>Avg: {orgAverages.openRate}%</span>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>100%</span>
                  </div>
                </div>

                {/* Click Rate Comparison */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: t.textSecondary }}>Click Rate</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: accountStats.clickRate >= orgAverages.clickRate ? t.success : t.danger }}>
                      {accountStats.clickRate}%
                      {accountStats.clickRate >= orgAverages.clickRate ? ' ↑' : ' ↓'}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: '8px', backgroundColor: t.bgHover, borderRadius: '4px', overflow: 'hidden' }}>
                    {/* Average marker */}
                    <div style={{
                      position: 'absolute',
                      left: `${Math.min(orgAverages.clickRate * 5, 100)}%`, // Scale for visibility
                      top: 0,
                      width: '2px',
                      height: '100%',
                      backgroundColor: t.textMuted,
                      zIndex: 2
                    }} />
                    {/* Account's rate */}
                    <div style={{
                      width: `${Math.min(accountStats.clickRate * 5, 100)}%`, // Scale for visibility
                      height: '100%',
                      backgroundColor: accountStats.clickRate >= orgAverages.clickRate ? t.success : t.warning,
                      borderRadius: '4px',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>0%</span>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>Avg: {orgAverages.clickRate}%</span>
                    <span style={{ fontSize: '10px', color: t.textMuted }}>20%+</span>
                  </div>
                </div>

                {/* Engagement Score */}
                <div style={{
                  padding: '16px',
                  backgroundColor: t.bg,
                  borderRadius: '10px',
                  textAlign: 'center',
                  marginTop: '8px'
                }}>
                  <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '4px' }}>ENGAGEMENT SCORE</div>
                  <div style={{ 
                    fontSize: '32px', 
                    fontWeight: '700', 
                    color: accountStats.openRate >= orgAverages.openRate && accountStats.clickRate >= orgAverages.clickRate 
                      ? t.success 
                      : accountStats.openRate >= orgAverages.openRate || accountStats.clickRate >= orgAverages.clickRate
                        ? t.warning
                        : t.danger
                  }}>
                    {accountStats.emailsSent === 0 ? '—' : 
                      accountStats.openRate >= orgAverages.openRate && accountStats.clickRate >= orgAverages.clickRate 
                        ? 'High' 
                        : accountStats.openRate >= orgAverages.openRate || accountStats.clickRate >= orgAverages.clickRate
                          ? 'Medium'
                          : 'Low'
                    }
                  </div>
                  <div style={{ fontSize: '12px', color: t.textSecondary, marginTop: '4px' }}>
                    {accountStats.emailsSent === 0 
                      ? 'No emails sent yet'
                      : accountStats.openRate >= orgAverages.openRate 
                        ? 'Above average engagement' 
                        : 'Below average engagement'
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Active Enrollments */}
            <div style={{
              padding: '20px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
                Active Automations
              </h3>
              {enrollments?.filter(e => e.status === 'Active').length > 0 ? (
                enrollments.filter(e => e.status === 'Active').map(enrollment => (
                  <EnrollmentCard 
                    key={enrollment.id} 
                    enrollment={enrollment} 
                    theme={t} 
                    userId={userId}
                  />
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted, fontSize: '13px' }}>
                  Not enrolled in any automations
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'emails' && (
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
            Email History
          </h3>
          {logsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                <Skeleton height="80px" />
              </div>
            ))
          ) : emailLogs?.length > 0 ? (
            emailLogs.map(log => (
              <EmailLogItem key={log.id} log={log} theme={t} />
            ))
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted }}>
              No emails sent to this client yet
            </div>
          )}
        </div>
      )}

      {activeTab === 'automations' && (
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
              Automation Enrollments
            </h3>
            <button
              style={{
                padding: '8px 12px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              + Enroll in Automation
            </button>
          </div>
          {enrollmentsLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                <Skeleton height="60px" />
              </div>
            ))
          ) : enrollments?.length > 0 ? (
            enrollments.map(enrollment => (
              <EnrollmentCard 
                key={enrollment.id} 
                enrollment={enrollment} 
                theme={t}
                userId={userId}
              />
            ))
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted }}>
              Not enrolled in any automations
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
            Activity Timeline
          </h3>
          {activitiesLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 0' }}>
                <Skeleton width="32px" height="32px" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="80%" height="14px" />
                  <div style={{ marginTop: '4px' }}><Skeleton width="120px" height="12px" /></div>
                </div>
              </div>
            ))
          ) : activities?.length > 0 ? (
            <div style={{ borderLeft: `2px solid ${t.border}`, marginLeft: '15px', paddingLeft: '20px' }}>
              {activities.map(activity => (
                <ActivityItem key={activity.id} activity={activity} theme={t} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted }}>
              No activity recorded yet
            </div>
          )}
        </div>
      )}

      {/* Compose Email Modal */}
      <ComposeEmailModal
        isOpen={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        account={client}
        theme={t}
        onSend={async (emailData) => {
          await sendDirectEmail.mutateAsync(emailData);
        }}
        sending={sendDirectEmail.isPending}
      />
    </div>
  );
};

export default ClientProfilePage;
