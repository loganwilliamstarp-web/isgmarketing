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
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [expandLoading, setExpandLoading] = useState(null);

  const isLoading = emailsLoading || scheduledLoading;

  // Build unified email list with engagement data inline
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
      replyCount: e.reply_count || 0,
      firstOpenedAt: e.first_opened_at,
      firstClickedAt: e.first_clicked_at,
      firstRepliedAt: e.first_replied_at,
      bodyHtml: e.body_html,
    }));

    const scheduled = (scheduledEmails || []).map(e => ({
      id: e.id,
      type: 'scheduled',
      subject: e.template?.subject || e.subject || '(No subject)',
      status: e.status || 'Pending',
      date: e.scheduled_for,
      automationName: e.automation?.name,
    }));

    return [...sent, ...scheduled].sort((a, b) => new Date(b.date) - new Date(a.date));
  })();

  const filteredEmails = activeFilter === 'all'
    ? allEmails
    : allEmails.filter(e => e.type === activeFilter);

  const sentCount = allEmails.filter(e => e.type === 'sent').length;
  const scheduledCount = allEmails.filter(e => e.type === 'scheduled').length;

  // Expand email to show click URLs and replies
  const handleExpand = useCallback(async (email) => {
    if (expandedEmail === email.id) {
      setExpandedEmail(null);
      return;
    }
    setExpandedEmail(email.id);

    if (expandedData[email.id]) return; // Already loaded

    setExpandLoading(email.id);
    try {
      const [detail, replies] = await Promise.all([
        emailLogsService.getByIdWithEvents(ownerIds, email.id),
        emailRepliesService.getByEmailLog(email.id),
      ]);

      const clickedUrls = (detail.events || [])
        .filter(ev => ev.event_type === 'click' && (ev.url || ev.event_data?.url))
        .map(ev => ({ url: ev.event_data?.url || ev.url, date: ev.created_at }))
        .filter((item, i, arr) => arr.findIndex(a => a.url === item.url) === i);

      const starRatings = (detail.events || [])
        .filter(ev => ev.event_type === 'star_rating')
        .map(ev => ({ rating: ev.event_data?.rating, date: ev.created_at }));

      setExpandedData(prev => ({
        ...prev,
        [email.id]: {
          clickedUrls,
          starRatings,
          replies: replies || [],
          events: detail.events || [],
          openCount: email.openCount,
          clickCount: email.clickCount,
          replyCount: email.replyCount,
          firstClickedAt: email.firstClickedAt,
          firstRepliedAt: email.firstRepliedAt,
        },
      }));
    } catch (err) {
      console.error('Failed to load email detail:', err);
      setExpandedData(prev => ({
        ...prev,
        [email.id]: {
          clickedUrls: [], starRatings: [], replies: [], events: [], error: err.message,
          openCount: email.openCount,
          clickCount: email.clickCount,
          replyCount: email.replyCount,
          firstClickedAt: email.firstClickedAt,
          firstRepliedAt: email.firstRepliedAt,
        },
      }));
    } finally {
      setExpandLoading(null);
    }
  }, [ownerIds, expandedEmail, expandedData]);

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
        .filter(ev => ev.event_type === 'click' && (ev.url || ev.event_data?.url))
        .map(ev => ev.url || ev.event_data?.url)
        .filter((url, i, arr) => arr.indexOf(url) === i);

      setPreviewData({ email: emailDetail, replies: replies || [], clickedUrls });
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
            {filteredEmails.map(email => {
              const isExpanded = expandedEmail === email.id;
              const detail = expandedData[email.id];
              const isLoadingDetail = expandLoading === email.id;

              return (
                <div key={`${email.type}-${email.id}`} style={styles.emailRow}>
                  {/* Subject + Actions Row */}
                  <div style={styles.emailSubjectRow}>
                    <div style={styles.emailSubject} title={email.subject}>{email.subject}</div>
                    {email.type === 'sent' && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button onClick={() => handleExpand(email)} style={styles.expandButton} title="Show details">
                          {isExpanded ? '▲' : '▼'}
                        </button>
                        <button onClick={() => handlePreview(email)} style={styles.previewButton} title="Preview email">
                          👁
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status + Date + Engagement Icons */}
                  <div style={styles.emailMeta}>
                    <span style={getStatusBadgeStyle(email.status)}>{email.status}</span>
                    <span style={styles.emailDate}>{formatRelativeDate(email.date)}</span>
                    {email.automationName && (
                      <span style={styles.automationTag}>{email.automationName}</span>
                    )}
                  </div>

                  {/* Inline Engagement Summary */}
                  {email.type === 'sent' && (email.openCount > 0 || email.clickCount > 0 || email.replyCount > 0) && (
                    <div style={styles.engagementIcons}>
                      {email.firstOpenedAt && (
                        <span style={styles.engagementChip} title={`Opened ${email.openCount}x — ${new Date(email.firstOpenedAt).toLocaleString()}`}>
                          📬 Opened {email.openCount > 1 ? `(${email.openCount}x)` : ''}
                        </span>
                      )}
                      {email.firstClickedAt && (
                        <span style={{ ...styles.engagementChip, backgroundColor: '#e3f3e3', color: '#2e844a' }} title={`Clicked ${email.clickCount}x`}>
                          🔗 Clicked {email.clickCount > 1 ? `(${email.clickCount}x)` : ''}
                        </span>
                      )}
                      {email.firstRepliedAt && (
                        <span style={{ ...styles.engagementChip, backgroundColor: '#e8f4fd', color: '#0070d2' }} title={`Replied ${new Date(email.firstRepliedAt).toLocaleString()}`}>
                          💬 Replied {email.replyCount > 1 ? `(${email.replyCount})` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expanded Detail */}
                  {isExpanded && email.type === 'sent' && (
                    <div style={styles.expandedSection}>
                      {isLoadingDetail && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0' }}>
                          <div style={{ ...styles.spinner, width: '14px', height: '14px' }} />
                          <span style={{ fontSize: '11px', color: '#706e6b' }}>Loading details...</span>
                        </div>
                      )}

                      {detail && (
                        <>
                          {/* Clicked URLs */}
                          {detail.clickedUrls.length > 0 && (
                            <div style={styles.detailBlock}>
                              <div style={styles.detailLabel}>CLICKED URLS</div>
                              {detail.clickedUrls.map((item, i) => (
                                <div key={i} style={styles.urlRow}>
                                  <span style={styles.urlText}>{item.url.length > 55 ? item.url.substring(0, 55) + '...' : item.url}</span>
                                  <span style={styles.urlDate}>{formatRelativeDate(item.date)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Star Ratings */}
                          {detail.starRatings && detail.starRatings.length > 0 && (
                            <div style={styles.detailBlock}>
                              <div style={styles.detailLabel}>STAR RATING</div>
                              {detail.starRatings.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '3px 0' }}>
                                  <span style={{ color: '#fbbf24', fontSize: '16px', letterSpacing: '1px' }}>
                                    {'★'.repeat(item.rating || 0)}{'☆'.repeat(5 - (item.rating || 0))}
                                  </span>
                                  <span style={{ color: '#3e3e3c', fontWeight: '500' }}>{item.rating}/5</span>
                                  {item.date && <span style={styles.urlDate}>{formatRelativeDate(item.date)}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Replies */}
                          {detail.replies.length > 0 && (
                            <div style={styles.detailBlock}>
                              <div style={styles.detailLabel}>REPLIES</div>
                              {detail.replies.map(reply => (
                                <div key={reply.id} style={styles.replyBox}>
                                  <div style={styles.replyHeader}>
                                    <strong>{reply.from_name || reply.from_email}</strong>
                                    <span style={styles.replyDate}>
                                      {reply.received_at ? formatRelativeDate(reply.received_at) : ''}
                                    </span>
                                  </div>
                                  <div style={styles.replyBody}>
                                    {(reply.body_text || reply.body_html?.replace(/<[^>]*>/g, '') || '').substring(0, 200)}
                                    {(reply.body_text || '').length > 200 ? '...' : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Fallback: clicks exist but no event rows */}
                          {detail.clickedUrls.length === 0 && detail.clickCount > 0 && (
                            <div style={styles.detailBlock}>
                              <div style={styles.detailLabel}>CLICKS</div>
                              <div style={styles.urlRow}>
                                <span style={{ color: '#706e6b', fontSize: '11px' }}>
                                  {detail.clickCount} click{detail.clickCount > 1 ? 's' : ''} — URL details not available
                                </span>
                                {detail.firstClickedAt && (
                                  <span style={styles.urlDate}>{formatRelativeDate(detail.firstClickedAt)}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Fallback: replies exist but no reply rows loaded */}
                          {detail.replies.length === 0 && detail.replyCount > 0 && (
                            <div style={styles.detailBlock}>
                              <div style={styles.detailLabel}>REPLIES</div>
                              <div style={{ fontSize: '11px', color: '#706e6b' }}>
                                {detail.replyCount} repl{detail.replyCount > 1 ? 'ies' : 'y'} received
                                {detail.firstRepliedAt && ` — ${formatRelativeDate(detail.firstRepliedAt)}`}
                              </div>
                            </div>
                          )}

                          {/* Error loading detail */}
                          {detail.error && (
                            <div style={{ fontSize: '12px', color: '#ea001e', padding: '4px 0' }}>
                              Error loading details: {detail.error}
                            </div>
                          )}

                          {/* Only show "no activity" when truly nothing */}
                          {!detail.error && detail.clickedUrls.length === 0 && detail.replies.length === 0
                            && (!detail.starRatings || detail.starRatings.length === 0)
                            && !detail.clickCount && !detail.replyCount && (
                            <div style={{ fontSize: '12px', color: '#706e6b', padding: '4px 0' }}>
                              No click or reply activity for this email.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
                      <div style={styles.engagementStatLabel}>Opens</div>
                      <div style={styles.engagementStatValue}>{previewData.email.open_count || 0}</div>
                    </div>
                    <div style={styles.engagementStat}>
                      <div style={styles.engagementStatLabel}>Clicks</div>
                      <div style={styles.engagementStatValue}>{previewData.email.click_count || 0}</div>
                    </div>
                    <div style={styles.engagementStat}>
                      <div style={styles.engagementStatLabel}>Replies</div>
                      <div style={styles.engagementStatValue}>{previewData.replies.length}</div>
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
    padding: '8px 4px',
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
  expandButton: {
    background: 'none',
    border: '1px solid #d8dde6',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '10px',
    color: '#706e6b',
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
  engagementIcons: {
    display: 'flex',
    gap: '6px',
    marginTop: '6px',
    flexWrap: 'wrap',
  },
  engagementChip: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    backgroundColor: '#f0f4ff',
    color: '#3e3e3c',
    whiteSpace: 'nowrap',
  },
  expandedSection: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #e5e5e5',
  },
  detailBlock: {
    marginBottom: '10px',
  },
  detailLabel: {
    fontSize: '10px',
    color: '#706e6b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  urlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    padding: '3px 0',
    gap: '8px',
  },
  urlText: {
    color: '#0070d2',
    wordBreak: 'break-all',
    flex: 1,
  },
  urlDate: {
    color: '#706e6b',
    flexShrink: 0,
    fontSize: '10px',
  },
  replyBox: {
    padding: '8px 10px',
    backgroundColor: '#f3f3f3',
    borderRadius: '6px',
    marginBottom: '6px',
  },
  replyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#706e6b',
    marginBottom: '4px',
  },
  replyDate: {
    fontSize: '10px',
    color: '#999',
  },
  replyBody: {
    fontSize: '12px',
    color: '#3e3e3c',
    lineHeight: '1.4',
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
    top: 0, left: 0, right: 0, bottom: 0,
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
  modalTitle: { fontSize: '16px', fontWeight: '600', color: '#3e3e3c' },
  modalClose: {
    background: 'none', border: 'none', fontSize: '18px',
    cursor: 'pointer', color: '#706e6b', padding: '4px 8px',
  },
  modalBody: { overflowY: 'auto', padding: '16px 20px', flex: 1 },

  // Preview content
  previewMeta: { marginBottom: '16px' },
  previewSubject: { fontSize: '16px', fontWeight: '600', color: '#3e3e3c', marginBottom: '8px' },
  previewMetaRow: { fontSize: '12px', color: '#706e6b', marginBottom: '2px' },
  engagementRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  engagementStat: {
    textAlign: 'center', padding: '8px 12px',
    backgroundColor: '#f3f3f3', borderRadius: '6px', flex: 1,
  },
  engagementStatLabel: {
    fontSize: '10px', color: '#706e6b',
    textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px',
  },
  engagementStatValue: { fontSize: '18px', fontWeight: '700', color: '#3e3e3c' },
  section: { marginBottom: '16px' },
  sectionLabel: {
    fontSize: '10px', color: '#706e6b', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
  },
  urlList: { margin: '0', paddingLeft: '16px', listStyleType: 'disc' },
  urlItem: { fontSize: '12px', color: '#3e3e3c', marginBottom: '2px', wordBreak: 'break-all' },
  previewFrame: { border: '1px solid #d8dde6', borderRadius: '4px', overflow: 'hidden' },
  iframe: { width: '100%', height: '400px', border: 'none' },
};

export default EmbedEmailActivityPage;
