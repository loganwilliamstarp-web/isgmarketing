// src/components/ComposeEmailModal.jsx
import React, { useState, useEffect } from 'react';
import { userSettingsService } from '../services/userSettings';

const ComposeEmailModal = ({ isOpen, onClose, account, theme: t, onSend, sending }) => {
  const [ownerSettings, setOwnerSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
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
    }
  }, [isOpen, account?.owner_id]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setBody('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const recipientEmail = account?.person_email || account?.email;
  const recipientName = account?.primary_contact_first_name
    ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
    : account?.name;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError('Please enter a subject');
      return;
    }

    if (!body.trim()) {
      setError('Please enter a message');
      return;
    }

    if (!recipientEmail) {
      setError('This account does not have an email address');
      return;
    }

    // Convert newlines to HTML paragraphs
    const bodyHtml = body
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');

    try {
      await onSend({
        accountId: account.account_unique_id,
        toEmail: recipientEmail,
        toName: recipientName,
        fromEmail: ownerSettings?.from_email,
        fromName: ownerSettings?.from_name,
        subject: subject.trim(),
        bodyHtml,
        bodyText: body.trim()
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send email');
    }
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
          maxWidth: '600px',
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
          </div>

          {/* Body */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: t.textSecondary, marginBottom: '6px' }}>
              Message
            </label>
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
              disabled={sending || !recipientEmail}
              style={{
                padding: '10px 20px',
                backgroundColor: sending || !recipientEmail ? t.textMuted : t.primary,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: sending || !recipientEmail ? 'not-allowed' : 'pointer',
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
