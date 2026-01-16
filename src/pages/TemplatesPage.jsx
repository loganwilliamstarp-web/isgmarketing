import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useTemplates,
  useTemplateCategories,
  useTemplateMutations,
  useEffectiveOwner
} from '../hooks';
import { useAuth } from '../contexts/AuthContext';
import { useMasterTemplates, useMasterTemplateMutations } from '../hooks/useAdmin';
import CollapsibleAgentSection, { AgentGroupControls, groupItemsByOwner } from '../components/CollapsibleAgentSection';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Helper function to strip HTML tags and convert to plain text for editing
const htmlToPlainText = (html) => {
  if (!html) return '';
  return html
    // Convert <br> and </p> to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Decode star symbols for star rating emails
    .replace(/&#9733;/g, '★')
    .replace(/&#9734;/g, '☆')
    .trim();
};

// Helper function to convert plain text back to simple HTML
const plainTextToHtml = (text) => {
  if (!text) return '';
  return text
    // Encode star symbols back to HTML entities before wrapping in HTML
    .replace(/★/g, '&#9733;')
    .replace(/☆/g, '&#9734;')
    .split('\n\n')
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph)
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n\n');
};

// Check if HTML content has complex structure that shouldn't be converted to plain text
const hasComplexHtml = (html) => {
  if (!html) return false;
  // Check for tables, divs with styles, or specific merge fields that indicate complex templates
  return /<table/i.test(html) ||
         /<div[^>]+style/i.test(html) ||
         /\{\{\s*rating_url_/i.test(html);
};

// Template editor modal
const TemplateEditor = ({ template, onSave, onClose, theme: t }) => {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');

  // Check if this template has complex HTML that needs to be preserved
  const originalHtml = template?.body_html || '';
  const isComplexTemplate = hasComplexHtml(originalHtml);

  // For complex templates, allow editing raw HTML; for simple templates, use plain text
  const [editMode, setEditMode] = useState(isComplexTemplate ? 'html' : 'text');
  const [body, setBody] = useState(
    isComplexTemplate
      ? originalHtml
      : htmlToPlainText(originalHtml || template?.body_text || '')
  );
  const [category, setCategory] = useState(template?.category || 'general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let bodyHtml, bodyText;

      if (editMode === 'html') {
        // In HTML mode, use the raw HTML as-is
        bodyHtml = body;
        bodyText = htmlToPlainText(body);
      } else {
        // In plain text mode, convert to HTML
        bodyHtml = plainTextToHtml(body);
        bodyText = body;
      }

      console.log('Template save - editMode:', editMode);
      console.log('Template save - body_html:', bodyHtml.substring(0, 200) + '...');

      await onSave({
        name,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        category
      });
      onClose();
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch between edit modes
  const switchToHtmlMode = () => {
    if (editMode === 'text') {
      setBody(plainTextToHtml(body));
    }
    setEditMode('html');
  };

  const switchToTextMode = () => {
    if (editMode === 'html') {
      setBody(htmlToPlainText(body));
    }
    setEditMode('text');
  };

  // Available merge fields
  const mergeFields = [
    { key: '{{first_name}}', label: 'First Name' },
    { key: '{{last_name}}', label: 'Last Name' },
    { key: '{{company_name}}', label: 'Company Name' },
    { key: '{{email}}', label: 'Email' },
    { key: '{{policy_type}}', label: 'Policy Type' },
    { key: '{{policy_expiration}}', label: 'Expiration Date' },
    { key: '{{agent_name}}', label: 'Agent Name' },
    { key: '{{agent_phone}}', label: 'Agent Phone' },
  ];

  const insertMergeField = (field) => {
    setBody(body + field);
  };

  // Get HTML content for preview
  const getPreviewHtml = () => {
    if (editMode === 'html') {
      return body;
    }
    return plainTextToHtml(body);
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }} 
        onClick={onClose} 
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        maxHeight: '90vh',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 101,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              >
                <option value="general">General</option>
                <option value="welcome">Welcome</option>
                <option value="renewal">Renewal</option>
                <option value="cross_sell">Cross-Sell</option>
                <option value="engagement">Engagement</option>
                <option value="policy_update">Policy Update</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Welcome to {{company_name}}!"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
          </div>

          {/* Merge Fields */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Insert Merge Field
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {mergeFields.map((field) => (
                <button
                  key={field.key}
                  onClick={() => insertMergeField(field.key)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>
                Email Body
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={switchToTextMode}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: editMode === 'text' ? t.primary : t.bgHover,
                    border: `1px solid ${editMode === 'text' ? t.primary : t.border}`,
                    borderRadius: '6px',
                    color: editMode === 'text' ? '#fff' : t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  Plain Text
                </button>
                <button
                  onClick={switchToHtmlMode}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: editMode === 'html' ? t.primary : t.bgHover,
                    border: `1px solid ${editMode === 'html' ? t.primary : t.border}`,
                    borderRadius: '6px',
                    color: editMode === 'html' ? '#fff' : t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  HTML
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    marginLeft: '8px'
                  }}
                >
                  Preview
                </button>
              </div>
            </div>
            {isComplexTemplate && editMode === 'html' && (
              <div style={{
                padding: '8px 12px',
                marginBottom: '8px',
                backgroundColor: `${t.warning}15`,
                border: `1px solid ${t.warning}30`,
                borderRadius: '6px',
                fontSize: '12px',
                color: t.text
              }}>
                This template has special HTML formatting (star ratings, tables). Edit carefully to preserve the structure.
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={editMode === 'html'
                ? "Enter HTML content here. Use merge fields like {{first_name}} for personalization."
                : "Write your email content here. Use merge fields like {{first_name}} for personalization."
              }
              rows={12}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: editMode === 'html' ? '13px' : '14px',
                resize: 'vertical',
                fontFamily: editMode === 'html' ? 'monospace' : 'inherit',
                lineHeight: '1.6'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name || !subject}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: isSubmitting || !name || !subject ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Saving...' : template ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>

      {/* HTML Preview Modal */}
      {showPreview && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 }}
            onClick={() => setShowPreview(false)}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '700px',
            maxHeight: '85vh',
            backgroundColor: '#fff',
            borderRadius: '12px',
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Preview Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f9fafb'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Email Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '4px 8px',
                  borderRadius: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* Preview Content - iframe for isolated rendering */}
            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f3f4f6', padding: '20px' }}>
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden'
              }}>
                <iframe
                  srcDoc={getPreviewHtml()}
                  title="Email Preview"
                  style={{
                    width: '100%',
                    height: '500px',
                    border: 'none'
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            {/* Preview Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#f9fafb'
            }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500'
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// Create Master Template Modal
const CreateMasterTemplateModal = ({ onSave, onClose, theme: t }) => {
  const [name, setName] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !defaultKey || !subject) return;
    setIsSubmitting(true);
    try {
      // Convert plain text to HTML when saving
      const bodyHtml = plainTextToHtml(body);
      await onSave({
        name,
        default_key: defaultKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        subject,
        category,
        body_html: bodyHtml,
        body_text: body, // Plain text version is what user typed
        version: 1,
        merge_fields: ['first_name', 'last_name', 'email', 'agent_name']
      });
      onClose();
    } catch (err) {
      console.error('Failed to create master template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxHeight: '90vh',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 101,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            Create Master Template
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}
          >
            x
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email Template"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Default Key *
              </label>
              <input
                type="text"
                value={defaultKey}
                onChange={(e) => setDefaultKey(e.target.value)}
                placeholder="e.g., welcome_template"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Subject Line *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Welcome to {{company_name}}!"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              >
                <option value="welcome">Welcome</option>
                <option value="renewal">Renewal</option>
                <option value="cross_sell">Cross-Sell</option>
                <option value="engagement">Engagement</option>
                <option value="policy_update">Policy Update</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here. Use merge fields like {{first_name}} for personalization."
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: '1.6'
              }}
            />
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: `${t.warning}15`,
            border: `1px solid ${t.warning}30`,
            borderRadius: '8px',
            fontSize: '13px',
            color: t.text
          }}>
            <strong>Note:</strong> This creates the master template. Use "Sync to Users" to push it to all user accounts.
            Users who haven't modified their template will receive the update.
          </div>
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name || !defaultKey || !subject}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: isSubmitting || !name || !defaultKey || !subject ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Master Template'}
          </button>
        </div>
      </div>
    </>
  );
};

// Master template card component (for admin viewing master templates)
const MasterTemplateCard = ({ template, onEdit, onSync, syncing, theme: t }) => {
  const categoryColors = {
    welcome: t.success,
    renewal: t.warning,
    cross_sell: t.primary,
    engagement: t.purple,
    policy_update: '#06b6d4',
    general: t.textMuted
  };

  return (
    <div style={{
      padding: '20px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      position: 'relative'
    }}>
      {/* Version badge */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        padding: '4px 8px',
        backgroundColor: t.bgHover,
        borderRadius: '4px',
        fontSize: '11px',
        color: t.textMuted
      }}>
        v{template.version || 1}
      </div>

      {/* Category badge */}
      <span style={{
        display: 'inline-block',
        padding: '4px 10px',
        backgroundColor: `${categoryColors[template.category] || t.textMuted}15`,
        color: categoryColors[template.category] || t.textMuted,
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '500',
        marginBottom: '12px',
        textTransform: 'capitalize'
      }}>
        {template.category?.replace('_', ' ') || 'General'}
      </span>

      <h4 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '6px' }}>
        {template.name}
      </h4>
      <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '8px' }}>
        {template.subject}
      </p>
      <p style={{
        fontSize: '12px',
        color: t.textMuted,
        marginBottom: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical'
      }}>
        {template.body_text?.substring(0, 100)}...
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={() => onSync(template.default_key)}
          disabled={syncing}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.textSecondary,
            cursor: syncing ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            opacity: syncing ? 0.5 : 1
          }}
        >
          {syncing ? 'Syncing...' : 'Sync to Users'}
        </button>
        <button
          onClick={() => onEdit(template)}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: t.primary,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500'
          }}
        >
          Edit Master
        </button>
      </div>
    </div>
  );
};

// Template card component
const TemplateCard = ({ template, onEdit, onDuplicate, onDelete, theme: t }) => {
  const [showMenu, setShowMenu] = useState(false);

  const categoryColors = {
    welcome: t.success,
    renewal: t.warning,
    cross_sell: t.primary,
    engagement: t.purple,
    policy_update: '#06b6d4',
    general: t.textMuted
  };

  return (
    <div style={{
      padding: '20px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      position: 'relative'
    }}>
      {/* Menu button */}
      <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ⋮
        </button>
        {showMenu && (
          <>
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 10 }} 
              onClick={() => setShowMenu(false)} 
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              backgroundColor: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              padding: '4px',
              zIndex: 11,
              minWidth: '140px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              <button
                onClick={() => { onEdit(template); setShowMenu(false); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: t.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left'
                }}
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => { onDuplicate(template); setShowMenu(false); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: t.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left'
                }}
              >
                📋 Duplicate
              </button>
              <button
                onClick={() => { onDelete(template.id); setShowMenu(false); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: t.danger,
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left'
                }}
              >
                🗑️ Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Category badge */}
      <span style={{
        display: 'inline-block',
        padding: '4px 10px',
        backgroundColor: `${categoryColors[template.category] || t.textMuted}15`,
        color: categoryColors[template.category] || t.textMuted,
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '500',
        marginBottom: '12px',
        textTransform: 'capitalize'
      }}>
        {template.category?.replace('_', ' ') || 'General'}
      </span>

      <h4 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '6px' }}>
        {template.name}
      </h4>
      <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '8px' }}>
        {template.subject}
      </p>
      <p style={{ 
        fontSize: '12px', 
        color: t.textMuted, 
        marginBottom: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical'
      }}>
        {template.body_text?.substring(0, 100)}...
      </p>
      
      {/* Stats */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        paddingTop: '12px', 
        borderTop: `1px solid ${t.border}`,
        fontSize: '11px',
        color: t.textMuted
      }}>
        <span>📧 {template.usage_count || 0} sent</span>
        <span>📬 {template.open_rate ? `${Math.round(template.open_rate)}%` : '—'} opens</span>
      </div>

      {/* Quick actions */}
      <button
        onClick={() => onEdit(template)}
        style={{
          marginTop: '12px',
          width: '100%',
          padding: '10px',
          backgroundColor: t.bgHover,
          border: `1px solid ${t.border}`,
          borderRadius: '8px',
          color: t.text,
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        Edit Template
      </button>
    </div>
  );
};

// Main Templates Page Component
const TemplatesPage = ({ t }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('my');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [syncingKey, setSyncingKey] = useState(null);
  const [expandAllTrigger, setExpandAllTrigger] = useState(null); // null, 'expand', or 'collapse'

  // Check if admin is viewing multiple users (master view mode)
  const { isAdmin, isAgencyAdmin, user } = useAuth();
  const { isMultiOwner } = useEffectiveOwner();
  const showMasterView = isAdmin && isMultiOwner;
  // Agency admin viewing all agents gets grouped view
  const showAgencyGroupedView = !isAdmin && isAgencyAdmin && isMultiOwner;

  // Fetch master templates (for admin master view)
  const {
    data: masterTemplates,
    isLoading: masterLoading,
    error: masterError
  } = useMasterTemplates();

  // Fetch user templates (include owner info for agency admin grouped view)
  const { data: templates, isLoading, error } = useTemplates({ includeOwnerInfo: showAgencyGroupedView });
  const { data: categories } = useTemplateCategories();

  // Mutations for user templates
  const {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate
  } = useTemplateMutations();

  // Mutations for master templates
  const { syncMasterTemplate, updateMasterTemplate, createMasterTemplate } = useMasterTemplateMutations();

  // State for create master template modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter templates (for user view)
  const filteredTemplates = templates?.filter(tmpl => {
    if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
    if (searchQuery && !tmpl.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !tmpl.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  // Filter master templates (for admin view)
  const filteredMasterTemplates = masterTemplates?.filter(tmpl => {
    if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
    if (searchQuery && !tmpl.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !tmpl.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  // Handlers
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleSaveTemplate = async (data) => {
    if (showMasterView && editingTemplate) {
      // Saving master template
      await updateMasterTemplate.mutateAsync({
        defaultKey: editingTemplate.default_key,
        updates: data
      });
    } else if (editingTemplate) {
      await updateTemplate.mutateAsync({ templateId: editingTemplate.id, updates: data });
    } else {
      await createTemplate.mutateAsync(data);
    }
  };

  const handleSyncMasterTemplate = async (defaultKey) => {
    try {
      setSyncingKey(defaultKey);
      await syncMasterTemplate.mutateAsync(defaultKey);
    } catch (err) {
      console.error('Failed to sync master template:', err);
    } finally {
      setSyncingKey(null);
    }
  };

  const handleCreateMasterTemplate = async (templateData) => {
    try {
      await createMasterTemplate.mutateAsync(templateData);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create master template:', err);
      throw err;
    }
  };

  const handleDuplicateTemplate = async (template) => {
    await duplicateTemplate.mutateAsync(template.id);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (window.confirm('Are you sure you want to delete this template?')) {
      await deleteTemplate.mutateAsync(templateId);
    }
  };

  // MASTER VIEW - Admin viewing all agencies
  if (showMasterView) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
              Master Templates
            </h1>
            <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
              Edit master email templates that sync to all users
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>+</span>
            Create Master Template
          </button>
        </div>

        {/* Error state */}
        {masterError && (
          <div style={{
            padding: '16px',
            backgroundColor: `${t.danger}15`,
            border: `1px solid ${t.danger}30`,
            borderRadius: '8px',
            marginBottom: '24px',
            color: t.danger,
            fontSize: '14px'
          }}>
            Failed to load master templates. Please try refreshing the page.
          </div>
        )}

        {/* Info banner */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: `${t.primary}10`,
          border: `1px solid ${t.primary}30`,
          borderRadius: '12px',
          marginBottom: '24px',
          fontSize: '14px',
          color: t.text
        }}>
          <strong>Admin View:</strong> Changes to master templates will sync to all user accounts.
          Users who have customized their templates will keep their custom versions.
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          alignItems: 'center'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
            <span style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: t.textMuted
            }}>
              🔍
            </span>
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '10px 12px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px',
              minWidth: '150px'
            }}
          >
            <option value="all">All Categories</option>
            <option value="welcome">Welcome</option>
            <option value="renewal">Renewal</option>
            <option value="cross_sell">Cross-Sell</option>
            <option value="engagement">Engagement</option>
            <option value="policy_update">Policy Update</option>
            <option value="general">General</option>
          </select>

          {/* Template count */}
          <span style={{ fontSize: '13px', color: t.textMuted }}>
            {filteredMasterTemplates.length} master template{filteredMasterTemplates.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Master Templates Grid */}
        {masterLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                padding: '20px',
                backgroundColor: t.bgCard,
                borderRadius: '12px',
                border: `1px solid ${t.border}`
              }}>
                <Skeleton width="80px" height="20px" />
                <div style={{ marginTop: '12px' }}><Skeleton width="180px" height="18px" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton width="220px" height="14px" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton height="40px" /></div>
              </div>
            ))}
          </div>
        ) : filteredMasterTemplates.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {filteredMasterTemplates.map((template) => (
              <MasterTemplateCard
                key={template.default_key}
                template={template}
                onEdit={handleEditTemplate}
                onSync={handleSyncMasterTemplate}
                syncing={syncingKey === template.default_key}
                theme={t}
              />
            ))}
          </div>
        ) : (
          <div style={{
            padding: '60px 20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
              {searchQuery || categoryFilter !== 'all' ? 'No templates found' : 'No master templates'}
            </h3>
            <p style={{ fontSize: '14px', color: t.textSecondary }}>
              {searchQuery || categoryFilter !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'Master templates will appear here when configured.'
              }
            </p>
          </div>
        )}

        {/* Template Editor Modal */}
        {editorOpen && (
          <TemplateEditor
            template={editingTemplate}
            onSave={handleSaveTemplate}
            onClose={() => setEditorOpen(false)}
            theme={t}
          />
        )}

        {/* Create Master Template Modal */}
        {showCreateModal && (
          <CreateMasterTemplateModal
            onSave={handleCreateMasterTemplate}
            onClose={() => setShowCreateModal(false)}
            theme={t}
            isSubmitting={createMasterTemplate.isPending}
          />
        )}
      </div>
    );
  }

  // AGENCY ADMIN GROUPED VIEW - Agency admin viewing all agents
  if (showAgencyGroupedView) {
    // Group templates by owner
    const agentGroups = groupItemsByOwner(templates || [], user?.id);

    // Apply filters to grouped templates
    const filteredAgentGroups = agentGroups.map(group => ({
      ...group,
      items: group.items.filter(tmpl => {
        if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
        if (searchQuery && !tmpl.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !tmpl.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
    })).filter(group => group.items.length > 0);

    const totalFilteredTemplates = filteredAgentGroups.reduce((sum, g) => sum + g.items.length, 0);

    // Handle expand/collapse all
    const handleExpandAll = () => {
      setExpandAllTrigger('expand');
      setTimeout(() => setExpandAllTrigger(null), 100);
    };

    const handleCollapseAll = () => {
      setExpandAllTrigger('collapse');
      setTimeout(() => setExpandAllTrigger(null), 100);
    };

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
              Email Templates
            </h1>
            <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
              View and manage email templates for all agents in your agency
            </p>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            padding: '16px',
            backgroundColor: `${t.danger}15`,
            border: `1px solid ${t.danger}30`,
            borderRadius: '8px',
            marginBottom: '24px',
            color: t.danger,
            fontSize: '14px'
          }}>
            Failed to load templates. Please try refreshing the page.
          </div>
        )}

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          alignItems: 'center'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
            <span style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: t.textMuted
            }}>
              🔍
            </span>
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '10px 12px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px',
              minWidth: '150px'
            }}
          >
            <option value="all">All Categories</option>
            <option value="welcome">Welcome</option>
            <option value="renewal">Renewal</option>
            <option value="cross_sell">Cross-Sell</option>
            <option value="engagement">Engagement</option>
            <option value="policy_update">Policy Update</option>
            <option value="general">General</option>
          </select>

          {/* Stats */}
          <span style={{ fontSize: '13px', color: t.textMuted }}>
            {totalFilteredTemplates} template{totalFilteredTemplates !== 1 ? 's' : ''} across {filteredAgentGroups.length} agent{filteredAgentGroups.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Expand/Collapse Controls */}
        {!isLoading && filteredAgentGroups.length > 0 && (
          <AgentGroupControls
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            theme={t}
          />
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                padding: '20px',
                backgroundColor: t.bgCard,
                borderRadius: '12px',
                border: `1px solid ${t.border}`
              }}>
                <Skeleton width="80px" height="20px" />
                <div style={{ marginTop: '12px' }}><Skeleton width="180px" height="18px" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton width="220px" height="14px" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton height="40px" /></div>
              </div>
            ))}
          </div>
        )}

        {/* Agent Groups */}
        {!isLoading && filteredAgentGroups.length > 0 && filteredAgentGroups.map((group) => (
          <CollapsibleAgentSection
            key={group.agentId}
            agentId={group.agentId}
            agentName={group.agentName}
            agentEmail={group.agentEmail}
            itemCount={group.items.length}
            isCurrentUser={group.agentId === user?.id}
            forceExpanded={expandAllTrigger === 'expand'}
            forceCollapsed={expandAllTrigger === 'collapse'}
            theme={t}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '16px' }}>
              {group.items.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={handleEditTemplate}
                  onDuplicate={handleDuplicateTemplate}
                  onDelete={handleDeleteTemplate}
                  theme={t}
                />
              ))}
            </div>
          </CollapsibleAgentSection>
        ))}

        {/* Empty State */}
        {!isLoading && filteredAgentGroups.length === 0 && (
          <div style={{
            padding: '60px 20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
              {searchQuery || categoryFilter !== 'all' ? 'No templates found' : 'No templates yet'}
            </h3>
            <p style={{ fontSize: '14px', color: t.textSecondary }}>
              {searchQuery || categoryFilter !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'No templates have been created by agents in your agency yet.'
              }
            </p>
          </div>
        )}

        {/* Template Editor Modal */}
        {editorOpen && (
          <TemplateEditor
            template={editingTemplate}
            onSave={handleSaveTemplate}
            onClose={() => setEditorOpen(false)}
            theme={t}
          />
        )}
      </div>
    );
  }

  // USER VIEW - Regular user or admin impersonating
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Email Templates
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Create and manage reusable email templates
          </p>
        </div>
        <button
          onClick={handleCreateTemplate}
          style={{
            padding: '10px 20px',
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
          <span>+</span> Create Template
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.danger}15`,
          border: `1px solid ${t.danger}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.danger,
          fontSize: '14px'
        }}>
          Failed to load templates. Please try refreshing the page.
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px'
            }}
          />
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: t.textMuted
          }}>
            🔍
          </span>
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Categories</option>
          <option value="welcome">Welcome</option>
          <option value="renewal">Renewal</option>
          <option value="cross_sell">Cross-Sell</option>
          <option value="engagement">Engagement</option>
          <option value="policy_update">Policy Update</option>
          <option value="general">General</option>
        </select>

        {/* Template count */}
        <span style={{ fontSize: '13px', color: t.textMuted }}>
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              padding: '20px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <Skeleton width="80px" height="20px" />
              <div style={{ marginTop: '12px' }}><Skeleton width="180px" height="18px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton width="220px" height="14px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton height="40px" /></div>
            </div>
          ))}
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={handleEditTemplate}
              onDuplicate={handleDuplicateTemplate}
              onDelete={handleDeleteTemplate}
              theme={t}
            />
          ))}
        </div>
      ) : (
        <div style={{
          padding: '60px 20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
            {searchQuery || categoryFilter !== 'all' ? 'No templates found' : 'No templates yet'}
          </h3>
          <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
            {searchQuery || categoryFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Create your first email template to get started.'
            }
          </p>
          {!searchQuery && categoryFilter === 'all' && (
            <button
              onClick={handleCreateTemplate}
              style={{
                padding: '10px 20px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Create Your First Template
            </button>
          )}
        </div>
      )}

      {/* Template Editor Modal */}
      {editorOpen && (
        <TemplateEditor
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setEditorOpen(false)}
          theme={t}
        />
      )}
    </div>
  );
};

export default TemplatesPage;
