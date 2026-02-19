import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useScheduledEmails, useScheduledEmailMutations } from '../hooks';
import { accountsService } from '../services/accounts';
import { userSettingsService } from '../services/userSettings';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Fix garbled UTF-8 characters from incorrectly encoded emails
const fixEncodingIssues = (content) => {
  if (!content) return content;

  // Use Unicode escapes to avoid build-time parsing issues with special chars
  const replacements = [
    // BOM - must be first
    ['\xef\xbb\xbf', ''],
    ['\uFEFF', ''],
    // Narrow no-break space (U+202F)
    ['\xe2\x80\xaf', ' '], ['\u202f', ' '],
    // Em dash (U+2014)
    ['\xe2\x80\x94', '\u2014'],
    // En dash (U+2013)
    ['\xe2\x80\x93', '\u2013'],
    // Right single quote (U+2019)
    ['\xe2\x80\x99', '\u2019'],
    // Left single quote (U+2018)
    ['\xe2\x80\x98', '\u2018'],
    // Right double quote (U+201D)
    ['\xe2\x80\x9d', '\u201d'],
    // Left double quote (U+201C)
    ['\xe2\x80\x9c', '\u201c'],
    // Bullet (U+2022)
    ['\xe2\x80\xa2', '\u2022'],
    // Ellipsis (U+2026)
    ['\xe2\x80\xa6', '\u2026'],
    // Stars
    ['\xe2\x98\x86', '\u2606'],
    ['\xe2\x98\x85', '\u2605'],
    // Non-breaking space issues
    ['\xc2\xa0', ' '],
    ['\xa0', ' '],
    // Accented characters (UTF-8 sequences misread as Latin-1)
    ['\xc3\xa9', '\xe9'], // é
    ['\xc3\xa8', '\xe8'], // è
    ['\xc3\xa0', '\xe0'], // à
    ['\xc3\xa2', '\xe2'], // â
    ['\xc3\xae', '\xee'], // î
    ['\xc3\xb4', '\xf4'], // ô
    ['\xc3\xbb', '\xfb'], // û
    ['\xc3\xa7', '\xe7'], // ç
    ['\xc3\x89', '\xc9'], // É
    ['\xc3\x80', '\xc0'], // À
  ];

  let result = content;
  for (const [bad, good] of replacements) {
    result = result.split(bad).join(good);
  }

  // Regex to catch remaining UTF-8 sequences misread as Latin-1
  result = result.replace(/[\xe2][\x80-\x9f][\x80-\xbf]/g, (match) => {
    const byte2 = match.charCodeAt(1);
    const byte3 = match.charCodeAt(2);
    const codePoint = ((0xe2 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
    const map = {
      0x2014: '\u2014', 0x2013: '\u2013', 0x2019: "'", 0x2018: "'",
      0x201c: '"', 0x201d: '"', 0x2022: '\u2022', 0x2026: '...', 0x202f: ' ',
    };
    return map[codePoint] || ' ';
  });

  return result;
};

// Status badge component
const StatusBadge = ({ status, theme: t }) => {
  const configs = {
    Pending: { bg: `${t.warning}20`, color: t.warning },
    Sent: { bg: `${t.success}20`, color: t.success },
    Failed: { bg: `${t.danger}20`, color: t.danger },
    Cancelled: { bg: `${t.textMuted}20`, color: t.textMuted },
  };
  const config = configs[status] || configs.Pending;

  return (
    <span style={{
      padding: '4px 10px',
      backgroundColor: config.bg,
      color: config.color,
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '500'
    }}>
      {status}
    </span>
  );
};

// Email Preview Modal
const EmailPreviewModal = ({ email, theme: t, onClose }) => {
  const [account, setAccount] = React.useState(null);
  const [userSettings, setUserSettings] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!email) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        if (email.account_id) {
          const accountData = await accountsService.getById(email.account_id);
          setAccount(accountData);
        }
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
      '{{email}}': acc.person_email || email.to_email || '',
      '{{recipient_name}}': email.to_name || '',
      '{{recipient_email}}': email.to_email || '',
      '{{today}}': new Date().toLocaleDateString('en-US'),
      '{{current_year}}': new Date().getFullYear().toString(),
    };

    let result = content;
    for (const [field, value] of Object.entries(mergeFields)) {
      result = result.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'gi'), value);
    }
    return result;
  };

  const subject = fixEncodingIssues(applyMergeFields(email.subject || email.template?.subject || 'No subject'));
  const htmlContent = fixEncodingIssues(applyMergeFields(email.body_html || email.template?.body_html || ''));

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
          >x</button>
        </div>

        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          backgroundColor: t.bg
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: t.textSecondary }}>From:</span>
            <span style={{ color: t.text }}>
              {email.from_name || userSettings?.from_name || 'Unknown'} &lt;{email.from_email || userSettings?.from_email || 'unknown'}&gt;
            </span>
            <span style={{ color: t.textSecondary }}>To:</span>
            <span style={{ color: t.text }}>
              {email.to_name || account?.name || 'Unknown'} &lt;{email.to_email || account?.person_email || 'unknown'}&gt;
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
          ) : htmlContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333' }}
            />
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
const ScheduledEmailsPage = ({ t }) => {
  const { userId } = useParams();
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [previewEmail, setPreviewEmail] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const { data: emails, isLoading } = useScheduledEmails({ status: statusFilter === 'All' ? undefined : statusFilter });
  const { sendNow, cancelScheduled } = useScheduledEmailMutations();

  const handleSendNow = async (emailId) => {
    if (sendingEmailId) return;
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

  const handleCancel = async (emailId) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    try {
      await cancelScheduled.mutateAsync(emailId);
    } catch (error) {
      console.error('Failed to cancel email:', error);
      alert('Failed to cancel email: ' + error.message);
    }
  };

  const statusOptions = ['All', 'Pending', 'Sent', 'Failed', 'Cancelled'];

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
          Scheduled Emails
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
          View and manage all scheduled emails
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        {statusOptions.map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: statusFilter === status ? t.primary : t.bgCard,
              color: statusFilter === status ? '#fff' : t.text,
              border: `1px solid ${statusFilter === status ? t.primary : t.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Email list */}
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
        ) : emails?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {emails.map((email, index) => (
              <div
                key={email.id}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: t.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🕐</span>
                      {new Date(email.scheduled_for).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                    <StatusBadge status={email.status} theme={t} />
                  </div>

                  <Link
                    to={`/${userId}/accounts/${email.account_id}`}
                    style={{ fontSize: '15px', fontWeight: '600', color: t.text, textDecoration: 'none' }}
                  >
                    {email.to_name || 'Unknown Recipient'}
                  </Link>

                  <div style={{ fontSize: '13px', color: t.textSecondary, marginTop: '2px' }}>
                    {email.subject || email.template?.subject || 'No subject'}
                  </div>

                  <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
                    From: {email.from_name || 'Unknown'} &lt;{email.from_email || 'unknown'}&gt;
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {email.template?.name && (
                      <span style={{
                        padding: '3px 8px',
                        backgroundColor: t.bgHover,
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: t.textSecondary
                      }}>
                        {email.template.name}
                      </span>
                    )}
                    {email.automation?.name && (
                      <span style={{
                        padding: '3px 8px',
                        backgroundColor: `${t.primary}15`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: t.primary
                      }}>
                        {email.automation.name}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => setPreviewEmail(email)}
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

                  {email.status === 'Pending' && (
                    <>
                      <button
                        onClick={() => handleSendNow(email.id)}
                        disabled={sendingEmailId === email.id}
                        title="Send Now"
                        style={{
                          padding: '8px 12px',
                          backgroundColor: sendingEmailId === email.id ? t.primary : t.bgHover,
                          border: `1px solid ${sendingEmailId === email.id ? t.primary : t.border}`,
                          borderRadius: '6px',
                          color: sendingEmailId === email.id ? '#fff' : t.textSecondary,
                          cursor: sendingEmailId === email.id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: sendingEmailId === email.id ? 0.7 : 1
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="22" y1="2" x2="11" y2="13"/>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                        {sendingEmailId === email.id ? 'Sending...' : 'Send Now'}
                      </button>
                      <button
                        onClick={() => handleCancel(email.id)}
                        title="Cancel"
                        style={{
                          padding: '8px 12px',
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.border}`,
                          borderRadius: '6px',
                          color: t.danger,
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: t.textMuted,
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontWeight: '500', marginBottom: '4px' }}>No scheduled emails</div>
            <div>
              {statusFilter === 'Pending'
                ? 'No emails are currently scheduled to be sent.'
                : `No emails with status "${statusFilter}" found.`}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
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

export default ScheduledEmailsPage;
