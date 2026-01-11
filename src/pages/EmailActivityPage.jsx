import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEmailActivityFeed } from '../hooks';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Activity Preview Modal
const ActivityPreviewModal = ({ activity, theme: t, onClose }) => {
  const [emailData, setEmailData] = React.useState(null);
  const [account, setAccount] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!activity?.email_log_id) {
      setLoading(false);
      return;
    }

    const fetchEmailData = async () => {
      setLoading(true);
      try {
        const { supabase } = await import('../lib/supabase');
        const { data, error } = await supabase
          .from('email_logs')
          .select(`
            *,
            account:accounts(*),
            template:email_templates(*)
          `)
          .eq('id', activity.email_log_id)
          .single();

        if (!error && data) {
          setEmailData(data);
          setAccount(data.account);
        }
      } catch (err) {
        console.error('Error fetching email data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmailData();
  }, [activity?.email_log_id]);

  if (!activity) return null;

  const isReply = activity.type === 'replied';
  const title = isReply ? 'Reply Preview' : 'Sent Email Preview';

  const applyMergeFields = (content) => {
    if (!content) return '';
    const acc = account || {};
    const nameParts = (acc.name || '').trim().split(/\s+/);
    const derivedFirstName = nameParts[0] || '';
    const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const mergeFields = {
      '{{first_name}}': acc.primary_contact_first_name || derivedFirstName,
      '{{last_name}}': acc.primary_contact_last_name || derivedLastName,
      '{{full_name}}': [acc.primary_contact_first_name, acc.primary_contact_last_name].filter(Boolean).join(' ') || acc.name || '',
      '{{name}}': acc.name || '',
      '{{company_name}}': acc.name || '',
      '{{email}}': acc.person_email || emailData?.to_email || '',
      '{{recipient_name}}': emailData?.to_name || '',
      '{{recipient_email}}': emailData?.to_email || '',
      '{{today}}': new Date().toLocaleDateString('en-US'),
      '{{current_year}}': new Date().getFullYear().toString(),
    };

    let result = content;
    for (const [field, value] of Object.entries(mergeFields)) {
      result = result.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'gi'), value);
    }
    return result;
  };

  const getBodyContent = () => {
    if (emailData?.body_html) return applyMergeFields(emailData.body_html);
    if (emailData?.template?.body_html) return applyMergeFields(emailData.template.body_html);
    return null;
  };

  const getTextContent = () => {
    if (emailData?.body_text) return applyMergeFields(emailData.body_text);
    if (emailData?.template?.body_text) return applyMergeFields(emailData.template.body_text);
    return null;
  };

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
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
            {title}
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
          >x</button>
        </div>

        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          backgroundColor: t.bg
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', fontSize: '13px' }}>
            {isReply ? (
              <>
                <span style={{ color: t.textSecondary }}>From:</span>
                <span style={{ color: t.text }}>{activity.from_email}</span>
              </>
            ) : (
              <>
                <span style={{ color: t.textSecondary }}>To:</span>
                <span style={{ color: t.text }}>
                  {activity.to_name || emailData?.to_name || 'Unknown'} &lt;{activity.to_email || emailData?.to_email || 'unknown'}&gt;
                </span>
              </>
            )}
            <span style={{ color: t.textSecondary }}>Subject:</span>
            <span style={{ color: t.text, fontWeight: '500' }}>{activity.subject || emailData?.subject || 'No subject'}</span>
            <span style={{ color: t.textSecondary }}>{isReply ? 'Received:' : 'Sent:'}</span>
            <span style={{ color: t.text }}>
              {new Date(activity.timestamp).toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </span>
            {activity.account?.name && (
              <>
                <span style={{ color: t.textSecondary }}>Account:</span>
                <span style={{ color: t.text }}>{activity.account.name}</span>
              </>
            )}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff'
        }}>
          {loading ? (
            <div style={{ color: t.textMuted, textAlign: 'center', padding: '40px', fontSize: '14px' }}>
              Loading preview...
            </div>
          ) : isReply && activity.snippet ? (
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333', whiteSpace: 'pre-wrap' }}>
              {activity.snippet}
              <div style={{
                marginTop: '20px',
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#666'
              }}>
                This is a preview snippet. View the full reply in your email client.
              </div>
            </div>
          ) : getBodyContent() ? (
            <div
              dangerouslySetInnerHTML={{
                __html: `<style>p { margin: 0 0 1em 0; } p:last-child { margin-bottom: 0; }</style>` + getBodyContent()
              }}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333' }}
            />
          ) : getTextContent() ? (
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333', whiteSpace: 'pre-wrap' }}>
              {getTextContent()}
            </div>
          ) : (
            <div style={{ color: t.textMuted, textAlign: 'center', padding: '40px', fontSize: '14px' }}>
              No email content available
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end'
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

// Main page component
const EmailActivityPage = ({ t }) => {
  const { userId } = useParams();
  const [typeFilter, setTypeFilter] = useState('All');
  const [previewActivity, setPreviewActivity] = useState(null);

  const { data: activities, isLoading } = useEmailActivityFeed({ limit: 100 });

  const typeOptions = ['All', 'Sent', 'Opened', 'Clicked', 'Replied'];

  const typeConfig = {
    sent: { icon: '📤', label: 'Sent', color: t.success },
    opened: { icon: '📬', label: 'Opened', color: t.primary },
    clicked: { icon: '🔗', label: 'Clicked', color: t.warning },
    replied: { icon: '💬', label: 'Replied', color: '#8b5cf6' }
  };

  const filteredActivities = activities?.filter(activity => {
    if (typeFilter === 'All') return true;
    return activity.type.toLowerCase() === typeFilter.toLowerCase();
  });

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
          Email Activity
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
          View all email sends, opens, clicks, and replies
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        {typeOptions.map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            style={{
              padding: '8px 16px',
              backgroundColor: typeFilter === type ? t.primary : t.bgCard,
              color: typeFilter === type ? '#fff' : t.text,
              border: `1px solid ${typeFilter === type ? t.primary : t.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {type !== 'All' && <span>{typeConfig[type.toLowerCase()]?.icon}</span>}
            {type}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ padding: '14px', backgroundColor: t.bg, borderRadius: '8px' }}>
                <Skeleton height="12px" width="150px" />
                <div style={{ marginTop: '8px' }}><Skeleton height="16px" width="250px" /></div>
                <div style={{ marginTop: '4px' }}><Skeleton height="12px" width="200px" /></div>
              </div>
            ))}
          </div>
        ) : filteredActivities?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredActivities.map((activity, index) => {
              const config = typeConfig[activity.type] || { icon: '📧', label: activity.type, color: t.textSecondary };
              const canPreview = activity.type === 'sent' || activity.type === 'replied';

              return (
                <div
                  key={activity.id}
                  style={{
                    padding: '16px 20px',
                    borderTop: index > 0 ? `1px solid ${t.border}` : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '16px' }}>{config.icon}</span>
                      <span style={{ fontSize: '12px', color: config.color, fontWeight: '500' }}>{config.label}</span>
                      <span style={{ fontSize: '11px', color: t.textMuted }}>
                        {new Date(activity.timestamp).toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div style={{ fontSize: '15px', fontWeight: '600', color: t.text }}>
                      {activity.subject || 'No subject'}
                    </div>

                    <div style={{ fontSize: '13px', color: t.textSecondary, marginTop: '2px' }}>
                      {activity.type === 'replied'
                        ? `From: ${activity.from_email}`
                        : `To: ${activity.to_name || activity.to_email}`}
                    </div>

                    {activity.type !== 'replied' && (activity.from_name || activity.from_email) && (
                      <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
                        From: {activity.from_name || 'Unknown'} &lt;{activity.from_email || 'unknown'}&gt;
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {activity.account?.name && (
                        <Link
                          to={`/${userId}/accounts/${activity.account.account_unique_id}`}
                          style={{
                            padding: '3px 8px',
                            backgroundColor: t.bgHover,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: t.textSecondary,
                            textDecoration: 'none'
                          }}
                        >
                          {activity.account.name}
                        </Link>
                      )}
                      {activity.open_count > 1 && (
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: `${t.primary}15`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: t.primary
                        }}>
                          {activity.open_count} opens
                        </span>
                      )}
                      {activity.click_count > 1 && (
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: `${t.warning}15`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: t.warning
                        }}>
                          {activity.click_count} clicks
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {canPreview && (
                      <button
                        onClick={() => setPreviewActivity(activity)}
                        title="Preview"
                        style={{
                          padding: '8px 12px',
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.border}`,
                          borderRadius: '6px',
                          color: t.textSecondary,
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        Preview
                      </button>
                    )}
                    {activity.email_log_id && (
                      <Link
                        to={`/${userId}/accounts/${activity.account?.account_unique_id || ''}`}
                        title="View Account"
                        style={{
                          padding: '8px 12px',
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.border}`,
                          borderRadius: '6px',
                          color: t.textSecondary,
                          textDecoration: 'none',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        View
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: t.textMuted,
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontWeight: '500', marginBottom: '4px' }}>No email activity</div>
            <div>
              {typeFilter === 'All'
                ? 'No email activity found.'
                : `No "${typeFilter}" activity found.`}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewActivity && (
        <ActivityPreviewModal
          activity={previewActivity}
          theme={t}
          onClose={() => setPreviewActivity(null)}
        />
      )}
    </div>
  );
};

export default EmailActivityPage;
