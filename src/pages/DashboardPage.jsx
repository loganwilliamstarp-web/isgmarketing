import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDashboard, useQuickStats, useUpcomingEmails, useEmailPerformanceChart, useScheduledEmailMutations } from '../hooks';
import { accountsService } from '../services/accounts';
import { userSettingsService } from '../services/userSettings';

// Loading skeleton component
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div 
    style={{ 
      width, 
      height, 
      backgroundColor: 'currentColor', 
      opacity: 0.1, 
      borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite'
    }} 
  />
);

// Stat card with loading state
const StatCard = ({ label, value, change, icon, positive, isLoading, theme: t }) => (
  <div style={{
    padding: '20px',
    backgroundColor: t.bgCard,
    borderRadius: '12px',
    border: `1px solid ${t.border}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
      <span style={{ color: t.textSecondary, fontSize: '13px' }}>{label}</span>
      <span style={{ fontSize: '20px' }}>{icon}</span>
    </div>
    {isLoading ? (
      <Skeleton height="32px" width="80px" />
    ) : (
      <>
        <div style={{ fontSize: '28px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>{value}</div>
        {change && (
          <span style={{ fontSize: '12px', color: positive ? t.success : t.danger }}>{change}</span>
        )}
      </>
    )}
  </div>
);

// Stat card with comparison bar
const ComparisonStatCard = ({ label, value, industryAvg, icon, isLoading, theme: t }) => {
  const numValue = parseFloat(value) || 0;
  const isAboveAvg = numValue > industryAvg;

  return (
    <div style={{
      padding: '20px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{ color: t.textSecondary, fontSize: '13px' }}>{label}</span>
        <span style={{ fontSize: '20px' }}>{icon}</span>
      </div>
      {isLoading ? (
        <>
          <Skeleton height="28px" width="60px" />
          <div style={{ marginTop: '8px' }}><Skeleton height="20px" /></div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '3px', height: '24px', marginTop: '8px' }}>
            <div style={{
              width: `${Math.max(Math.min(numValue, 100), 5)}%`,
              backgroundColor: t.primary,
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '24px'
            }}>
              <span style={{ fontSize: '9px', color: '#fff', fontWeight: '600' }}>{numValue}%</span>
            </div>
            <div style={{
              width: `${Math.max(Math.min(industryAvg, 100), 5)}%`,
              backgroundColor: '#14b8a6',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '24px'
            }}>
              <span style={{ fontSize: '9px', color: '#fff', fontWeight: '600' }}>{industryAvg}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Email Preview Modal
const EmailPreviewModal = ({ email, theme: t, onClose }) => {
  const [account, setAccount] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch account data
        if (email.account_id) {
          const accountData = await accountsService.getById(email.account_id);
          setAccount(accountData);
        }
        // Fetch user settings for signature and agency info
        if (email.owner_id) {
          const settings = await userSettingsService.get(email.owner_id);
          setUserSettings(settings);
        }
      } catch (err) {
        console.error('Error fetching preview data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [email]);

  if (!email) return null;

  // Apply merge fields to content
  const applyMergeFields = (content) => {
    if (!content) return '';
    const acc = account || {};

    // Extract first/last name from account.name if dedicated fields aren't available
    const nameParts = (acc.name || '').trim().split(/\s+/);
    const derivedFirstName = nameParts[0] || '';
    const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const mergeFields = {
      '{{first_name}}': acc.primary_contact_first_name || derivedFirstName,
      '{{last_name}}': acc.primary_contact_last_name || derivedLastName,
      '{{full_name}}': [acc.primary_contact_first_name, acc.primary_contact_last_name].filter(Boolean).join(' ') || acc.name || '',
      '{{name}}': acc.name || '',
      '{{company_name}}': acc.name || '',
      '{{email}}': acc.person_email || email.to_email || '',
      '{{phone}}': acc.phone || '',
      '{{address}}': acc.billing_street || '',
      '{{city}}': acc.billing_city || '',
      '{{state}}': acc.billing_state || '',
      '{{zip}}': acc.billing_postal_code || '',
      '{{postal_code}}': acc.billing_postal_code || '',
      '{{recipient_name}}': email.to_name || '',
      '{{recipient_email}}': email.to_email || '',
      '{{today}}': new Date().toLocaleDateString('en-US'),
      '{{current_year}}': new Date().getFullYear().toString(),
      '{{trigger_date}}': email.qualification_value || '',
    };

    let result = content;
    for (const [field, value] of Object.entries(mergeFields)) {
      result = result.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'gi'), value);
    }
    return result;
  };

  // Build email footer with signature and agency info
  const buildFooter = () => {
    if (!userSettings) return '';

    let footer = '';

    // Add signature (reset p margins inside signature to avoid double spacing)
    if (userSettings.signature_html) {
      footer += `<div style="margin-top: 20px; font-family: Arial, sans-serif;"><style>.email-sig p { margin: 0; }</style><div class="email-sig">${userSettings.signature_html}</div></div>`;
    }

    // Add agency footer
    if (userSettings.agency_name || userSettings.agency_address || userSettings.agency_phone) {
      footer += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #666; font-family: Arial, sans-serif;">
          ${userSettings.agency_name ? `<strong>${userSettings.agency_name}</strong><br>` : ''}
          ${userSettings.agency_address ? `${userSettings.agency_address}<br>` : ''}
          ${userSettings.agency_phone ? `${userSettings.agency_phone}` : ''}
          ${userSettings.agency_website ? ` | <a href="${userSettings.agency_website}" style="color: #666;">${userSettings.agency_website}</a>` : ''}
        </div>
      `;
    }

    // Add unsubscribe link (preview placeholder)
    footer += `
      <div style="margin-top: 20px; text-align: center; font-size: 11px; color: #999; font-family: Arial, sans-serif;">
        <a href="#" style="color: #999;">Unsubscribe</a> from these emails
      </div>
    `;

    return footer;
  };

  // Use scheduled email's own body first (populated during sync), fallback to template
  const subject = applyMergeFields(email.subject || email.template?.subject || 'No subject');
  const htmlContent = applyMergeFields(email.body_html || email.template?.body_html || '');
  const footerHtml = buildFooter();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
            Email Preview
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: t.textSecondary,
              padding: '4px 8px'
            }}
          >×</button>
        </div>

        {/* Email Details */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          backgroundColor: t.bg
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: t.textSecondary }}>From:</span>
            <span style={{ color: t.text }}>
              {email.from_name || userSettings?.from_name || 'Unknown'} &lt;{email.from_email || userSettings?.from_email || 'unknown@email.com'}&gt;
            </span>

            <span style={{ color: t.textSecondary }}>To:</span>
            <span style={{ color: t.text }}>
              {email.to_name || account?.name || 'Unknown'} &lt;{email.to_email || account?.person_email || 'unknown@email.com'}&gt;
            </span>

            <span style={{ color: t.textSecondary }}>Subject:</span>
            <span style={{ color: t.text, fontWeight: '500' }}>{subject}</span>

            <span style={{ color: t.textSecondary }}>Scheduled:</span>
            <span style={{ color: t.text }}>
              {new Date(email.scheduled_for).toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>

        {/* Email Body */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff'
        }}>
          {loading ? (
            <div style={{
              color: t.textMuted,
              textAlign: 'center',
              padding: '40px',
              fontSize: '14px'
            }}>
              Loading preview...
            </div>
          ) : htmlContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: `<style>p { margin: 0 0 1em 0; } p:last-child { margin-bottom: 0; }</style>` + htmlContent + footerHtml }}
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#333'
              }}
            />
          ) : (
            <div style={{
              color: t.textMuted,
              textAlign: 'center',
              padding: '40px',
              fontSize: '14px'
            }}>
              No email content available
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.text,
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Scheduled email item
const ScheduledEmailItem = ({ email, theme: t, userId, onPreview, onSendNow, onCancel, isSending }) => (
  <div style={{
    padding: '14px',
    backgroundColor: t.bg,
    borderRadius: '8px',
    border: `1px solid ${t.border}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🕐</span> {new Date(email.scheduled_for).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })}
        </div>
        <Link
          to={`/${userId}/clients/${email.account_id}`}
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: t.text,
            textDecoration: 'none'
          }}
        >
          {email.to_name || email.account?.name || 'Unknown Account'}
        </Link>
        <div style={{ fontSize: '12px', color: t.textSecondary, marginTop: '2px' }}>
          {email.template?.subject || email.subject || 'No subject'}
        </div>

        {/* From info */}
        <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
          From: {email.from_name || 'Unknown'} &lt;{email.from_email || 'unknown'}&gt;
        </div>

        <span style={{
          display: 'inline-block',
          marginTop: '6px',
          padding: '3px 8px',
          backgroundColor: t.bgHover,
          borderRadius: '4px',
          fontSize: '11px',
          color: t.textSecondary
        }}>
          {email.template?.name || email.automation?.name || 'Unknown Template'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onPreview(email)}
          title="Preview Email"
          style={{
            padding: '6px 10px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '6px',
            color: t.textSecondary,
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Send Now clicked for email:', email.id);
            onSendNow(email.id);
          }}
          disabled={isSending}
          title="Send Now"
          style={{
            padding: '6px 10px',
            backgroundColor: isSending ? t.primary : t.bgHover,
            border: `1px solid ${isSending ? t.primary : t.border}`,
            borderRadius: '6px',
            color: isSending ? '#fff' : t.textSecondary,
            cursor: isSending ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isSending ? 0.7 : 1
          }}>
          {isSending ? (
            <span style={{ fontSize: '12px' }}>...</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
        <button
          onClick={() => onCancel(email.id)}
          title="Cancel"
          style={{
            padding: '6px 10px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '6px',
            color: t.textSecondary,
            cursor: 'pointer',
            fontSize: '12px'
          }}>×</button>
      </div>
    </div>
  </div>
);

// Main Dashboard Page Component
const DashboardPage = ({ t }) => {
  const { userId } = useParams();
  const [previewEmail, setPreviewEmail] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  // Fetch dashboard data using hooks
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuickStats();
  const { data: upcomingEmails, isLoading: emailsLoading } = useUpcomingEmails(7);
  const { data: chartData, isLoading: chartLoading } = useEmailPerformanceChart(30);
  const { sendNow, cancelScheduled } = useScheduledEmailMutations();

  // Handle send now
  const handleSendNow = async (emailId) => {
    if (sendingEmailId) return; // Prevent double-click
    setSendingEmailId(emailId);
    try {
      await sendNow.mutateAsync(emailId);
    } catch (error) {
      console.error('Failed to send email:', error);
      alert('Failed to send email: ' + error.message);
    } finally {
      setSendingEmailId(null);
    }
  };

  // Handle cancel
  const handleCancel = async (emailId) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    try {
      await cancelScheduled.mutateAsync(emailId);
    } catch (error) {
      console.error('Failed to cancel email:', error);
      alert('Failed to cancel email: ' + error.message);
    }
  };

  // Format numbers
  const formatNumber = (num) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num?.toLocaleString() || '0';
  };

  const formatPercent = (num) => `${Math.round(num || 0)}%`;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>Dashboard</h1>
        <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
          Overview of your email campaigns and performance
        </p>
      </div>

      {/* Error state */}
      {statsError && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.danger}15`,
          border: `1px solid ${t.danger}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.danger,
          fontSize: '14px'
        }}>
          Failed to load dashboard data. Please try refreshing the page.
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          label="Emails Sent"
          value={formatNumber(stats?.emailsSent)}
          change={stats?.emailsSentChange ? `${stats.emailsSentChange > 0 ? '+' : ''}${stats.emailsSentChange}%` : null}
          icon="📧"
          positive={stats?.emailsSentChange > 0}
          isLoading={statsLoading}
          theme={t}
        />
        <ComparisonStatCard
          label="Open Rate"
          value={Math.round(stats?.openRate || 0)}
          industryAvg={32}
          icon="📬"
          isLoading={statsLoading}
          theme={t}
        />
        <ComparisonStatCard
          label="Click Rate"
          value={Math.round(stats?.clickRate || 0)}
          industryAvg={8}
          icon="🖱️"
          isLoading={statsLoading}
          theme={t}
        />
        <ComparisonStatCard
          label="Response Rate"
          value={Math.round(stats?.responseRate || 0)}
          industryAvg={5}
          icon="💬"
          isLoading={statsLoading}
          theme={t}
        />
        <StatCard
          label="Scheduled"
          value={formatNumber(stats?.scheduledCount)}
          change={null}
          icon="📅"
          positive={null}
          isLoading={statsLoading}
          theme={t}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Upcoming Scheduled Emails */}
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
              Upcoming Scheduled Emails
            </h3>
            <Link
              to={`/${userId}/automations`}
              style={{ fontSize: '12px', color: t.primary, textDecoration: 'none' }}
            >
              View all →
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '16px' }}>
            Emails scheduled to be sent in the next 7 days
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {emailsLoading ? (
              // Loading skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  padding: '14px',
                  backgroundColor: t.bg,
                  borderRadius: '8px',
                  border: `1px solid ${t.border}`
                }}>
                  <Skeleton height="12px" width="120px" />
                  <div style={{ marginTop: '8px' }}><Skeleton height="16px" width="180px" /></div>
                  <div style={{ marginTop: '4px' }}><Skeleton height="12px" width="220px" /></div>
                </div>
              ))
            ) : upcomingEmails?.length > 0 ? (
              upcomingEmails.slice(0, 5).map((email) => (
                <ScheduledEmailItem
                  key={email.id}
                  email={email}
                  theme={t}
                  userId={userId}
                  onPreview={setPreviewEmail}
                  onSendNow={handleSendNow}
                  onCancel={handleCancel}
                  isSending={sendingEmailId === email.id}
                />
              ))
            ) : (
              <div style={{ 
                padding: '40px 20px', 
                textAlign: 'center', 
                color: t.textMuted,
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                No scheduled emails in the next 7 days
              </div>
            )}
          </div>
        </div>

        {/* Recent Email Activity */}
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
              Recent Email Activity
            </h3>
            <Link
              to={`/${userId}/timeline`}
              style={{ fontSize: '12px', color: t.primary, textDecoration: 'none' }}
            >
              View all →
            </Link>
          </div>

          {chartLoading ? (
            <Skeleton height="200px" />
          ) : chartData?.length > 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              height: '200px',
              padding: '20px 0'
            }}>
              {chartData.slice(-14).map((day, i) => {
                const maxSent = Math.max(...chartData.map(d => d.sent || 0), 1);
                const height = ((day.sent || 0) / maxSent) * 150;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${height}px`,
                        backgroundColor: t.primary,
                        borderRadius: '4px 4px 0 0',
                        minHeight: '4px'
                      }}
                      title={`${day.sent || 0} sent on ${day.date}`}
                    />
                    <span style={{ fontSize: '9px', color: t.textMuted }}>
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: t.textMuted,
              fontSize: '14px'
            }}>
              No email activity data yet
            </div>
          )}
        </div>
      </div>

      {/* Email Preview Modal */}
      {previewEmail && (
        <EmailPreviewModal
          email={previewEmail}
          theme={t}
          onClose={() => setPreviewEmail(null)}
        />
      )}
    </div>
  );
};

export default DashboardPage;
