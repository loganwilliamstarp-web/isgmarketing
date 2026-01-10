import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDashboard, useQuickStats, useUpcomingEmails, useEmailPerformanceChart } from '../hooks';

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

// Email Preview Modal
const EmailPreviewModal = ({ email, theme: t, onClose }) => {
  if (!email) return null;

  // Apply merge fields to content
  const applyMergeFields = (content) => {
    if (!content) return '';
    const account = email.account || {};
    const mergeFields = {
      '{{first_name}}': account.primary_contact_first_name || '',
      '{{last_name}}': account.primary_contact_last_name || '',
      '{{full_name}}': [account.primary_contact_first_name, account.primary_contact_last_name].filter(Boolean).join(' ') || account.name || '',
      '{{name}}': account.name || '',
      '{{company_name}}': account.name || '',
      '{{email}}': account.person_email || email.to_email || '',
      '{{phone}}': account.phone || '',
      '{{address}}': account.billing_street || '',
      '{{city}}': account.billing_city || '',
      '{{state}}': account.billing_state || '',
      '{{zip}}': account.billing_postal_code || '',
      '{{postal_code}}': account.billing_postal_code || '',
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

  const subject = applyMergeFields(email.template?.subject || email.subject || 'No subject');
  const htmlContent = applyMergeFields(email.template?.body_html || '');

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
              {email.from_name || 'Unknown'} &lt;{email.from_email || 'unknown@email.com'}&gt;
            </span>

            <span style={{ color: t.textSecondary }}>To:</span>
            <span style={{ color: t.text }}>
              {email.to_name || email.account?.name || 'Unknown'} &lt;{email.to_email || email.account?.person_email || 'unknown@email.com'}&gt;
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
          {htmlContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: htmlContent }}
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
const ScheduledEmailItem = ({ email, theme: t, userId, onPreview }) => (
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
            fontSize: '12px'
          }}>👁️</button>
        <button
          title="Send Now"
          style={{
            padding: '6px 10px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '6px',
            color: t.textSecondary,
            cursor: 'pointer',
            fontSize: '12px'
          }}>✈️</button>
        <button
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

// Performance comparison bar
const PerformanceBar = ({ label, you, avg, theme: t }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
      <span style={{ fontSize: '12px', color: t.textSecondary }}>{label}</span>
      <span style={{ fontSize: '12px', color: t.textMuted }}>{you}% vs {avg}%</span>
    </div>
    <div style={{ display: 'flex', gap: '4px', height: '24px' }}>
      <div style={{ 
        width: `${Math.min(you, 100)}%`, 
        backgroundColor: t.primary, 
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '6px',
        minWidth: '30px'
      }}>
        <span style={{ fontSize: '10px', color: '#fff', fontWeight: '600' }}>{you}%</span>
      </div>
      <div style={{ 
        width: `${Math.min(avg, 100)}%`, 
        backgroundColor: '#14b8a6', 
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '6px',
        minWidth: '30px'
      }}>
        <span style={{ fontSize: '10px', color: '#fff', fontWeight: '600' }}>{avg}%</span>
      </div>
    </div>
  </div>
);

// Main Dashboard Page Component
const DashboardPage = ({ t }) => {
  const { userId } = useParams();
  const [previewEmail, setPreviewEmail] = useState(null);

  // Fetch dashboard data using hooks
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuickStats();
  const { data: upcomingEmails, isLoading: emailsLoading } = useUpcomingEmails(7);
  const { data: chartData, isLoading: chartLoading } = useEmailPerformanceChart(30);

  // Calculate comparison stats (mock for now - would come from aggregate query)
  const comparisonStats = [
    { label: 'Open Rate', you: stats?.openRate || 0, avg: 32 },
    { label: 'Click Rate', you: stats?.clickRate || 0, avg: 8 },
    { label: 'Response Rate', you: stats?.responseRate || 0, avg: 5 },
  ];

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          label="Emails Sent"
          value={formatNumber(stats?.emailsSent)}
          change={stats?.emailsSentChange ? `${stats.emailsSentChange > 0 ? '+' : ''}${stats.emailsSentChange}%` : null}
          icon="📧"
          positive={stats?.emailsSentChange > 0}
          isLoading={statsLoading}
          theme={t}
        />
        <StatCard
          label="Open Rate"
          value={formatPercent(stats?.openRate)}
          change={stats?.openRateChange ? `${stats.openRateChange > 0 ? '+' : ''}${stats.openRateChange}%` : null}
          icon="📬"
          positive={stats?.openRateChange > 0}
          isLoading={statsLoading}
          theme={t}
        />
        <StatCard
          label="Click Rate"
          value={formatPercent(stats?.clickRate)}
          change={stats?.clickRateChange ? `${stats.clickRateChange > 0 ? '+' : ''}${stats.clickRateChange}%` : null}
          icon="🖱️"
          positive={stats?.clickRateChange > 0}
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

        {/* Performance Comparison */}
        <div style={{
          padding: '20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
            Performance Comparison
          </h3>
          <p style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '16px' }}>
            Your metrics compared to industry averages
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {statsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton height="12px" width="100px" />
                  <div style={{ marginTop: '8px' }}><Skeleton height="24px" /></div>
                </div>
              ))
            ) : (
              comparisonStats.map((metric, i) => (
                <PerformanceBar 
                  key={i} 
                  label={metric.label} 
                  you={metric.you} 
                  avg={metric.avg} 
                  theme={t} 
                />
              ))
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: t.primary, borderRadius: '2px' }} />
              <span style={{ fontSize: '11px', color: t.textSecondary }}>You</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: '#14b8a6', borderRadius: '2px' }} />
              <span style={{ fontSize: '11px', color: t.textSecondary }}>Industry Avg</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div style={{
        marginTop: '20px',
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
