// src/components/ComposeEmailModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { userSettingsService } from '../services/userSettings';
import { templatesService } from '../services/templates';
import { useAuth } from '../contexts/AuthContext';

// Helper to strip HTML for plain text preview
const htmlToPlainText = (html) => {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#9733;/g, '★')
    .replace(/&#9734;/g, '☆')
    .trim();
};

// Check if template has complex HTML (star ratings, tables, etc.)
const hasComplexHtml = (html) => {
  if (!html) return false;
  return /<table/i.test(html) ||
         /<div[^>]+style/i.test(html) ||
         /\{\{\s*rating_url_/i.test(html);
};

const ComposeEmailModal = ({ isOpen, onClose, account, theme: t, onSend, sending }) => {
  const { canPerformActions } = useAuth();
  const [ownerSettings, setOwnerSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [useTemplate, setUseTemplate] = useState(false);
  const [error, setError] = useState(null);

  // Fetch settings for the account owner when modal opens
  useEffect(() => {
    if (isOpen && account?.owner_id) {
      setLoadingSettings(true);
      userSettingsService.get(account.owner_id)
        .then(settings => {
          setOwnerSettings(settings);
        })
        .catch(err => {
          console.error('Failed to load owner settings:', err);
        })
        .finally(() => {
          setLoadingSettings(false);
        });

      // Also fetch templates for this owner
      setLoadingTemplates(true);
      templatesService.getAll(account.owner_id)
        .then(data => {
          setTemplates(data || []);
        })
        .catch(err => {
          console.error('Failed to load templates:', err);
        })
        .finally(() => {
          setLoadingTemplates(false);
        });
    }
  }, [isOpen, account?.owner_id]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setBody('');
      setSelectedTemplate(null);
      setUseTemplate(false);
      setError(null);
    }
  }, [isOpen]);

  // When a template is selected, populate subject and body
  useEffect(() => {
    if (selectedTemplate) {
      setSubject(selectedTemplate.subject || '');
      // For display in textarea, show plain text version
      setBody(htmlToPlainText(selectedTemplate.body_html || selectedTemplate.body_text || ''));
    }
  }, [selectedTemplate]);

  // Group templates by category - must be before early return (hooks rule)
  const templatesByCategory = useMemo(() => {
    const groups = {};
    templates.forEach(tmpl => {
      const cat = tmpl.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tmpl);
    });
    return groups;
  }, [templates]);

  // Early return must come after all hooks
  if (!isOpen) return null;

  const recipientEmail = account?.person_email || account?.email;
  const recipientName = account?.primary_contact_first_name
    ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
    : account?.name;

  // Check if selected template has complex HTML that shouldn't be edited
  const isComplexTemplate = selectedTemplate && hasComplexHtml(selectedTemplate.body_html);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!canPerformActions) {
      setError('Your trial has expired. Contact your administrator to activate your account.');
      return;
    }

    if (!subject.trim()) {
      setError('Please enter a subject');
      return;
    }

    if (!useTemplate && !body.trim()) {
      setError('Please enter a message');
      return;
    }

    if (useTemplate && !selectedTemplate) {
      setError('Please select a template');
      return;
    }

    if (!recipientEmail) {
      setError('This account does not have an email address');
      return;
    }

    let bodyHtml, bodyText;

    if (useTemplate && selectedTemplate) {
      // Use the original template HTML (preserves star ratings, tables, etc.)
      bodyHtml = selectedTemplate.body_html;
      bodyText = htmlToPlainText(bodyHtml);
    } else {
      // Convert newlines to HTML paragraphs for custom message
      bodyHtml = body
        .split('\n\n')
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
      bodyText = body.trim();
    }

    try {
      await onSend({
        accountId: account.account_unique_id,
        toEmail: recipientEmail,
        toName: recipientName,
        fromEmail: ownerSettings?.from_email,
        fromName: ownerSettings?.from_name,
        subject: subject.trim(),
        bodyHtml,
        bodyText
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send email');
    }
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setUseTemplate(true);
  };

  const handleClearTemplate = () => {
    setSelectedTemplate(null);
    setUseTemplate(false);
    setSubject('');
    setBody('');
  };

  const categoryLabels = {
    engagement: 'Engagement',
    welcome: 'Welcome',
    renewal: 'Renewal',
    cross_sell: 'Cross-Sell',
    policy_update: 'Policy Update',
    general: 'General'
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: `1px solid ${t.border}`
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            Send Email
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: t.textMuted,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {/* To field */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              To
            </label>
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: t.bgHover,
                borderRadius: '8px',
                fontSize: '14px',
                color: t.text
              }}
            >
              {recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail || 'No email address'}
            </div>
          </div>

          {/* From field */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              From
            </label>
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: t.bgHover,
                borderRadius: '8px',
                fontSize: '14px',
                color: t.text
              }}
            >
              {loadingSettings ? 'Loading...' : (
                ownerSettings?.from_name ? `${ownerSettings.from_name} <${ownerSettings.from_email}>` : ownerSettings?.from_email || 'Not configured'
              )}
            </div>
          </div>

          {/* Template Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              Template (Optional)
            </label>

            {selectedTemplate ? (
              // Show selected template
              <div
                style={{
                  padding: '12px',
                  backgroundColor: `${t.primary}10`,
                  border: `1px solid ${t.primary}40`,
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: t.text }}>
                    {selectedTemplate.name}
                  </div>
                  <div style={{ fontSize: '12px', color: t.textSecondary, marginTop: '2px' }}>
                    {selectedTemplate.category && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        backgroundColor: t.bgHover,
                        borderRadius: '4px',
                        marginRight: '8px',
                        textTransform: 'capitalize'
                      }}>
                        {selectedTemplate.category.replace('_', ' ')}
                      </span>
                    )}
                    {isComplexTemplate && (
                      <span style={{ color: t.warning }}>
                        Contains star rating
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearTemplate}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              // Template dropdown
              <div>
                {loadingTemplates ? (
                  <div style={{ padding: '10px', color: t.textMuted, fontSize: '14px' }}>
                    Loading templates...
                  </div>
                ) : templates.length > 0 ? (
                  <select
                    value=""
                    onChange={(e) => {
                      const tmpl = templates.find(t => t.id.toString() === e.target.value);
                      if (tmpl) handleTemplateSelect(tmpl);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: t.bg,
                      border: `1px solid ${t.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: t.text,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Write custom message...</option>
                    {Object.entries(templatesByCategory).map(([category, tmplList]) => (
                      <optgroup key={category} label={categoryLabels[category] || category}>
                        {tmplList.map(tmpl => (
                          <option key={tmpl.id} value={tmpl.id}>
                            {tmpl.name}
                            {hasComplexHtml(tmpl.body_html) ? ' (Star Rating)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: t.bgHover,
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: t.textMuted
                  }}>
                    No templates available. Writing custom message.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject..."
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                color: t.text,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {useTemplate && selectedTemplate && (
              <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
                Merge fields like {'{{first_name}}'} will be replaced with account data.
              </p>
            )}
          </div>

          {/* Body */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              Message {isComplexTemplate && <span style={{ color: t.warning }}>(Preview Only)</span>}
            </label>

            {isComplexTemplate ? (
              // Read-only preview for complex templates
              <div>
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: t.text,
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }}
                >
                  {body || 'Template content preview...'}
                </div>
                <p style={{ fontSize: '11px', color: t.warning, marginTop: '4px' }}>
                  This template contains special formatting (star ratings). The full HTML will be sent - edit in Templates page if needed.
                </p>
              </div>
            ) : (
              // Editable textarea for simple templates or custom messages
              <div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type your message..."
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: t.text,
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: '1.5',
                    boxSizing: 'border-box'
                  }}
                />
                <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
                  The account owner's email signature will be added automatically.
                </p>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: `${t.danger}15`,
                borderRadius: '8px',
                color: t.danger,
                fontSize: '13px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !recipientEmail || !canPerformActions}
              title={!canPerformActions ? 'Your trial has expired' : ''}
              style={{
                padding: '10px 20px',
                backgroundColor: (sending || !recipientEmail || !canPerformActions) ? t.textMuted : t.primary,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: (sending || !recipientEmail || !canPerformActions) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {sending ? (
                <>
                  <span style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Sending...
                </>
              ) : (
                <>Send Email</>
              )}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default ComposeEmailModal;
