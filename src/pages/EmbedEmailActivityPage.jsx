import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAccountEmailLogs } from '../hooks/useEmailLogs';
import { useAccountScheduledEmails } from '../hooks/useScheduledEmails';
import { useEffectiveOwner } from '../hooks/useEffectiveOwner';
import { emailLogsService, emailRepliesService } from '../services/emailLogs';

const EmbedEmailActivityPage = () => {
  const { accountId } = useParams();
  const { ownerIds } = useEffectiveOwner();
  const { data: emailLogs, isLoading: emailsLoading } = useAccountEmailLogs(accountId);
  const { data: scheduledEmails, isLoading: scheduledLoading } = useAccountScheduledEmails(accountId);

  const [activeFilter, setActiveFilter] = useState('all');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const isLoading = emailsLoading || scheduledLoading;

  // Merge sent and scheduled emails into a unified list
  const allEmails = (() => {
    const sent = (emailLogs || []).map(e => ({
      id: e.id,
      type: 'sent',
      subject: e.subject || '(No subject)',
      status: e.status || 'Sent',
      date: e.sent_at || e.created_at,
      automationName: e.automation?.name,
      fromEmail: e.from_email,
      fromName: e.from_name,
      toEmail: e.to_email,
      toName: e.to_name,
      openCount: e.open_count || 0,
      clickCount: e.click_count || 0,
      bodyHtml: e.body_html,
    }));

    const scheduled = (scheduledEmails || []).map(e => ({
      id: e.id,
      type: 'scheduled',
      subject: e.template?.subject || e.subject || '(No subject)',
      status: e.status || 'Pending',
      date: e.scheduled_for,
      automationName: e.automation?.name,
      fromEmail: e.from_email,
      fromName: e.from_name,
      toEmail: e.to_email,
      toName: e.to_name,
    }));

    return [...sent, ...scheduled].sort((a, b) => new Date(b.date) - new Date(a.date));
  })();

  const filteredEmails = activeFilter === 'all'
    ? allEmails
    : allEmails.filter(e => e.type === activeFilter);

  const sentCount = allEmails.filter(e => e.type === 'sent').length;
  const scheduledCount = allEmails.filter(e => e.type === 'scheduled').length;

  // Preview modal
  const handlePreview = useCallback(async (email) => {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

    try {
      const [emailDetail, replies] = await Promise.all([
        emailLogsService.getByIdWithEvents(ownerIds, email.id),
        emailRepliesService.getByEmailLog(email.id),
      ]);

      const clickedUrls = (emailDetail.events || [])
        .filter(ev => ev.event_type === 'click' && ev.url)
        .map(ev => ev.url)
        .filter((url, i, arr) => arr.indexOf(url) === i);

      setPreviewData({
        email: emailDetail,
        replies: replies || [],
        clickedUrls,
      });
    } catch (err) {
      setPreviewError(err.message || 'Unable to load email preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [ownerIds]);

  const handleClosePreview = () => {
    setShowPreview(false);
    setPreviewData(null);
    setPreviewError(null);
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <div style={{ color: '#706e6b', fontSize: '13px', marginTop: '8px' }}>Loading...</div>
        </div>
        <style>{globalCSS}</style>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerIcon}>📧</span>
          <span style={styles.headerText}>Email Activity</span>
          <span style={styles.headerCount}>{allEmails.length}</span>
        </div>

        {/* Filter Buttons */}
        <div style={styles.filterRow}>
          {[
            { key: 'all', label: `All (${allEmails.length})` },
            { key: 'sent', label: `Sent (${sentCount})` },
            { key: 'scheduled', label: `Scheduled (${scheduledCount})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              style={{
                ...styles.filterButton,
                ...(activeFilter === f.key ? styles.filterButtonActive : {}),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Email List */}
        {filteredEmails.length === 0 ? (
          <div style={styles.emptyState}>No emails found.</div>
        ) : (
          <div>
            {filteredEmails.map(email => (
              <div key={`${email.type}-${email.id}`} style={styles.emailRow}>
                <div style={styles.emailRowMain}>
                  <div style={styles.emailSubjectRow}>
                    <div style={styles.emailSubject} title={email.subject}>{email.subject}</div>
                    {email.type === 'sent' && (
                      <button
                        onClick={() => handlePreview(email)}
                        style={styles.previewButton}
                        title="Preview email"
                      >
                        👁
                      </button>
                    )}
                  </div>
                  <div style={styles.emailMeta}>
                    <span style={getStatusBadgeStyle(email.status)}>{email.status}</span>
                    <span style={styles.emailDate}>{formatRelativeDate(email.date)}</span>
                    {email.automationName && (
                      <span style={styles.automationTag}>{email.automationName}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div style={styles.modalBackdrop} onClick={handleClosePreview}>
          <div style={styles.modalContainer} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Email Preview</span>
              <button onClick={handleClosePreview} style={styles.modalClose}>✕</button>
            </div>
            <div style={styles.modalBody}>
              {previewLoading && (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner} />
                </div>
              )}
              {previewError && (
                <div style={{ color: '#ea001e', fontSize: '13px', padding: '16px' }}>{previewError}</div>
              )}
              {previewData && (
                <>
                  {/* Email Metadata */}
                  <div style={styles.previewMeta}>
                    <div style={styles.previewSubject}>{previewData.email.subject}</div>
                    <div style={styles.previewMetaRow}>
                      <strong>From:</strong> {previewData.email.from_name || ''} &lt;{previewData.email.from_email}&gt;
                    </div>
                    <div style={styles.previewMetaRow}>
                      <strong>To:</strong> {previewData.email.to_name || ''} &lt;{previewData.email.to_email}&gt;
                    </div>
                    <div style={styles.previewMetaRow}>
                      <strong>Sent:</strong> {previewData.email.sent_at ? new Date(previewData.email.sent_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>

                  {/* Engagement Stats */}
                  <div style={styles.engagementRow}>
                    <div style={styles.engagementStat}>
                      <div style={styles.engagementLabel}>Opens</div>
                      <div style={styles.engagementValue}>{previewData.email.open_count || 0}</div>
                    </div>
                    <div style={styles.engagementStat}>
                      <div style={styles.engagementLabel}>Clicks</div>
                      <div style={styles.engagementValue}>{previewData.email.click_count || 0}</div>
                    </div>
                  </div>

                  {/* Clicked URLs */}
                  {previewData.clickedUrls.length > 0 && (
                    <div style={styles.section}>
                      <div style={styles.sectionLabel}>CLICKED URLS</div>
                      <ul style={styles.urlList}>
                        {previewData.clickedUrls.map((url, i) => (
                          <li key={i} style={styles.urlItem}>
                            {url.length > 60 ? url.substring(0, 60) + '...' : url}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Email Body */}
                  <div style={styles.section}>
                    <div style={styles.sectionLabel}>EMAIL CONTENT</div>
                    <div style={styles.previewFrame}>
                      <iframe
                        srcDoc={previewData.email.body_html || previewData.email.template?.body_html || '<p>No email content available.</p>'}
                        sandbox="allow-same-origin"
                        style={styles.iframe}
                        title="Email content preview"
                      />
                    </div>
                  </div>

                  {/* Replies */}
                  {previewData.replies.length > 0 && (
                    <div style={styles.section}>
                      <div style={styles.sectionLabel}>REPLIES ({previewData.replies.length})</div>
                      {previewData.replies.map(reply => (
                        <div key={reply.id} style={styles.replyBox}>
                          <div style={styles.replyHeader}>
                            <strong>{reply.from_name || reply.from_email}</strong>
                            <span style={styles.replyDate}>
                              {reply.received_at ? new Date(reply.received_at).toLocaleString() : ''}
                            </span>
                          </div>
                          <div style={styles.replyBody}>{reply.body_text || reply.body_html?.replace(/<[^>]*>/g, '') || ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{globalCSS}</style>
    </div>
  );
};

// Utilities
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const futureDiffMs = date - now;
  const futureDays = Math.floor(futureDiffMs / (1000 * 60 * 60 * 24));

  if (futureDiffMs > 0) {
    const futureHours = Math.floor(futureDiffMs / (1000 * 60 * 60));
    if (futureHours < 1) return 'Less than 1hr';
    if (futureHours < 24) return `In ${futureHours}hr`;
    if (futureDays === 1) return 'Tomorrow';
    if (futureDays < 7) return `In ${futureDays}d`;
    return date.toLocaleDateString();
  }

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function getStatusBadgeStyle(status) {
  const s = (status || '').toLowerCase();
  let bg = '#f3f3f3';
  let color = '#706e6b';

  if (s === 'replied' || s === 'clicked') { bg = '#e3f3e3'; color = '#2e844a'; }
  else if (s === 'opened' || s === 'delivered') { bg = '#e1f5fe'; color = '#0070d2'; }
  else if (s === 'bounced' || s === 'failed') { bg = '#fce4e4'; color = '#ea001e'; }
  else if (s === 'pending' || s === 'processing') { bg = '#f3e8ff'; color = '#7c3aed'; }
  else if (s === 'sent') { bg = '#e1f5fe'; color = '#0070d2'; }

  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '500',
    backgroundColor: bg,
    color,
    whiteSpace: 'nowrap',
  };
}

const globalCSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  body { margin: 0; background: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
`;

const styles = {
  container: {
    padding: '0',
    minHeight: '100%',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #e2e8f0',
    borderTopColor: '#0070d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '4px',
    border: '1px solid #d8dde6',
    padding: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e5e5',
    marginBottom: '12px',
  },
  headerIcon: { fontSize: '16px' },
  headerText: { fontSize: '14px', fontWeight: '600', color: '#3e3e3c' },
  headerCount: {
    fontSize: '12px',
    color: '#706e6b',
    backgroundColor: '#f3f3f3',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  filterRow: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
  },
  filterButton: {
    padding: '5px 12px',
    fontSize: '12px',
    border: '1px solid #d8dde6',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3e3e3c',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  filterButtonActive: {
    backgroundColor: '#0070d2',
    color: '#ffffff',
    borderColor: '#0070d2',
  },
  emailRow: {
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  emailRowMain: {},
  emailSubjectRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '4px',
  },
  emailSubject: {
    fontSize: '13px',
    color: '#3e3e3c',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  previewButton: {
    background: 'none',
    border: '1px solid #d8dde6',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '14px',
    flexShrink: 0,
  },
  emailMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  emailDate: {
    fontSize: '11px',
    color: '#706e6b',
  },
  automationTag: {
    fontSize: '10px',
    color: '#706e6b',
    backgroundColor: '#f3f3f3',
    padding: '1px 6px',
    borderRadius: '3px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px 0',
    fontSize: '13px',
    color: '#706e6b',
  },

  // Modal
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '680px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e5e5',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#3e3e3c',
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#706e6b',
    padding: '4px 8px',
  },
  modalBody: {
    overflowY: 'auto',
    padding: '16px 20px',
    flex: 1,
  },

  // Preview content
  previewMeta: {
    marginBottom: '16px',
  },
  previewSubject: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#3e3e3c',
    marginBottom: '8px',
  },
  previewMetaRow: {
    fontSize: '12px',
    color: '#706e6b',
    marginBottom: '2px',
  },
  engagementRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  engagementStat: {
    textAlign: 'center',
    padding: '10px 16px',
    backgroundColor: '#f3f3f3',
    borderRadius: '6px',
    flex: 1,
  },
  engagementLabel: {
    fontSize: '10px',
    color: '#706e6b',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: '4px',
  },
  engagementValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#3e3e3c',
  },
  section: {
    marginBottom: '16px',
  },
  sectionLabel: {
    fontSize: '10px',
    color: '#706e6b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  urlList: {
    margin: '0',
    paddingLeft: '16px',
    listStyleType: 'disc',
  },
  urlItem: {
    fontSize: '12px',
    color: '#3e3e3c',
    marginBottom: '2px',
    wordBreak: 'break-all',
  },
  previewFrame: {
    border: '1px solid #d8dde6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  iframe: {
    width: '100%',
    height: '400px',
    border: 'none',
  },
  replyBox: {
    padding: '10px 12px',
    backgroundColor: '#f3f3f3',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  replyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#706e6b',
    marginBottom: '6px',
  },
  replyDate: {
    fontSize: '11px',
    color: '#999',
  },
  replyBody: {
    fontSize: '13px',
    color: '#3e3e3c',
    lineHeight: '1.4',
  },
};

export default EmbedEmailActivityPage;
