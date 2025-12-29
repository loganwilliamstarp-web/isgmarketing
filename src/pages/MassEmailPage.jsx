import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  useTemplates,
  useTemplateMutations,
  useMassEmailBatchesWithStats,
  useMassEmailRecipients,
  useMassEmailRecipientCount,
  useMassEmailMutations
} from '../hooks';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Status badge component
const StatusBadge = ({ status, theme: t }) => {
  const colors = {
    Draft: { bg: t.textMuted, text: '#fff' },
    Scheduled: { bg: t.warning, text: '#fff' },
    Sending: { bg: t.primary, text: '#fff' },
    Completed: { bg: t.success, text: '#fff' },
    Cancelled: { bg: t.danger, text: '#fff' }
  };

  const color = colors[status] || colors.Draft;

  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      backgroundColor: `${color.bg}20`,
      color: color.bg,
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '500'
    }}>
      {status}
    </span>
  );
};

// Template Editor Modal (reused from TemplatesPage pattern)
const TemplateEditorModal = ({ template, onSave, onClose, theme: t }) => {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body_html || template?.body_text || '');
  const [category, setCategory] = useState(template?.category || 'general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const savedTemplate = await onSave({
        name,
        subject,
        body_html: body,
        body_text: body.replace(/<[^>]*>/g, ''),
        category
      });
      onClose(savedTemplate);
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        onClick={() => onClose(null)}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 201,
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
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button
            onClick={() => onClose(null)}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}
          >
            ×
          </button>
        </div>

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
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here. Use merge fields like {{first_name}} for personalization."
              rows={10}
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
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={() => onClose(null)}
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
            {isSubmitting ? 'Creating...' : 'Create & Select'}
          </button>
        </div>
      </div>
    </>
  );
};

// Batch card for history
const BatchCard = ({ batch, onView, theme: t }) => {
  const sentPercent = batch.total_recipients > 0
    ? Math.round((batch.emails_sent / batch.total_recipients) * 100)
    : 0;

  return (
    <div style={{
      padding: '16px',
      backgroundColor: t.bgCard,
      borderRadius: '10px',
      border: `1px solid ${t.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontWeight: '600', color: t.text }}>{batch.name || 'Untitled Batch'}</span>
          <StatusBadge status={batch.status} theme={t} />
        </div>
        <p style={{ fontSize: '13px', color: t.textSecondary, margin: 0 }}>
          {batch.subject || 'No subject'}
        </p>
        <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
          {batch.template?.name || 'Custom email'} • {batch.total_recipients || 0} recipients
        </p>
      </div>

      {batch.status !== 'Draft' && (
        <div style={{ textAlign: 'right', minWidth: '100px' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: t.text }}>{sentPercent}%</div>
          <div style={{ fontSize: '11px', color: t.textMuted }}>
            {batch.emails_sent || 0} / {batch.total_recipients || 0} sent
          </div>
        </div>
      )}

      <button
        onClick={() => onView(batch)}
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
        View
      </button>
    </div>
  );
};

// Step indicator
const StepIndicator = ({ currentStep, steps, theme: t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
    {steps.map((step, index) => (
      <React.Fragment key={step}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: index <= currentStep ? t.primary : t.bgHover,
            color: index <= currentStep ? '#fff' : t.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            {index < currentStep ? '✓' : index + 1}
          </div>
          <span style={{
            fontSize: '14px',
            fontWeight: index === currentStep ? '600' : '400',
            color: index <= currentStep ? t.text : t.textMuted
          }}>
            {step}
          </span>
        </div>
        {index < steps.length - 1 && (
          <div style={{
            flex: 1,
            height: '2px',
            backgroundColor: index < currentStep ? t.primary : t.border,
            minWidth: '40px'
          }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// Template selection step with create new option
const TemplateStep = ({ selectedTemplate, onSelect, onCreateNew, templates, isLoading, theme: t }) => {
  const [search, setSearch] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!search) return templates;
    return templates.filter(tmpl =>
      tmpl.name.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.subject.toLowerCase().includes(search.toLowerCase())
    );
  }, [templates, search]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
          Select an Email Template
        </h3>
        <button
          onClick={onCreateNew}
          style={{
            padding: '8px 16px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>+</span> Create New Template
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '16px', backgroundColor: t.bgCard, borderRadius: '10px', border: `1px solid ${t.border}` }}>
              <Skeleton width="120px" height="16px" />
              <div style={{ marginTop: '8px' }}><Skeleton width="200px" height="14px" /></div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', maxHeight: '400px', overflow: 'auto' }}>
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              onClick={() => onSelect(template)}
              style={{
                padding: '16px',
                backgroundColor: t.bgCard,
                borderRadius: '10px',
                border: `2px solid ${selectedTemplate?.id === template.id ? t.primary : t.border}`,
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                {template.name}
              </div>
              <div style={{ fontSize: '13px', color: t.textSecondary }}>
                {template.subject}
              </div>
              <div style={{
                marginTop: '8px',
                padding: '4px 8px',
                backgroundColor: `${t.primary}15`,
                color: t.primary,
                borderRadius: '4px',
                fontSize: '11px',
                display: 'inline-block',
                textTransform: 'capitalize'
              }}>
                {template.category || 'General'}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filteredTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
          {search ? 'No templates match your search' : 'No templates available. Create one to get started!'}
        </div>
      )}
    </div>
  );
};

// Recipients filter step with advanced filters
const RecipientsStep = ({ filterConfig, setFilterConfig, recipientCount, isLoading, theme: t }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const statuses = [
    { value: 'customer', label: 'Customers' },
    { value: 'prospect', label: 'Prospects' },
    { value: 'prior_customer', label: 'Prior Customers' },
    { value: 'lead', label: 'Leads' }
  ];

  const policyTypes = [
    { value: 'Auto', label: 'Auto' },
    { value: 'Home', label: 'Home' },
    { value: 'Renters', label: 'Renters' },
    { value: 'Life', label: 'Life' },
    { value: 'Umbrella', label: 'Umbrella' },
    { value: 'Commercial', label: 'Commercial' },
    { value: 'Health', label: 'Health' }
  ];

  const toggleStatus = (status) => {
    const currentStatuses = filterConfig.statuses || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];
    setFilterConfig({ ...filterConfig, statuses: newStatuses });
  };

  const togglePolicyType = (policyType) => {
    const currentTypes = filterConfig.policyTypes || [];
    const newTypes = currentTypes.includes(policyType)
      ? currentTypes.filter(p => p !== policyType)
      : [...currentTypes, policyType];
    setFilterConfig({ ...filterConfig, policyTypes: newTypes });
  };

  const activeFiltersCount = [
    (filterConfig.statuses || []).length > 0,
    (filterConfig.policyTypes || []).length > 0,
    filterConfig.hasPolicy,
    filterConfig.hasExpiringPolicy,
    filterConfig.search
  ].filter(Boolean).length;

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
        Filter Recipients
      </h3>

      {/* Account Status Filter */}
      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '12px' }}>
          Account Status
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {statuses.map(status => (
            <button
              key={status.value}
              onClick={() => toggleStatus(status.value)}
              style={{
                padding: '8px 16px',
                backgroundColor: (filterConfig.statuses || []).includes(status.value) ? t.primary : t.bgHover,
                color: (filterConfig.statuses || []).includes(status.value) ? '#fff' : t.text,
                border: `1px solid ${(filterConfig.statuses || []).includes(status.value) ? t.primary : t.border}`,
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.15s'
              }}
            >
              {status.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: t.textMuted, marginTop: '8px' }}>
          {(filterConfig.statuses || []).length === 0
            ? 'All account types will be included'
            : `Only ${(filterConfig.statuses || []).join(', ')} accounts will be included`}
        </p>
      </div>

      {/* Advanced Filters Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: '12px',
          color: t.text,
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Advanced Filters
          {activeFiltersCount > 0 && (
            <span style={{
              padding: '2px 8px',
              backgroundColor: t.primary,
              color: '#fff',
              borderRadius: '10px',
              fontSize: '11px'
            }}>
              {activeFiltersCount} active
            </span>
          )}
        </span>
        <span style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          ▼
        </span>
      </button>

      {/* Advanced Filters Content */}
      {showAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          {/* Policy Type Filter */}
          <div style={{
            padding: '20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '12px' }}>
              Policy Type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {policyTypes.map(policy => (
                <button
                  key={policy.value}
                  onClick={() => togglePolicyType(policy.value)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: (filterConfig.policyTypes || []).includes(policy.value) ? t.primary : t.bgHover,
                    color: (filterConfig.policyTypes || []).includes(policy.value) ? '#fff' : t.text,
                    border: `1px solid ${(filterConfig.policyTypes || []).includes(policy.value) ? t.primary : t.border}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    transition: 'all 0.15s'
                  }}
                >
                  {policy.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: t.textMuted, marginTop: '8px' }}>
              {(filterConfig.policyTypes || []).length === 0
                ? 'All policy types included'
                : `Only accounts with ${(filterConfig.policyTypes || []).join(', ')} policies`}
            </p>
          </div>

          {/* Policy Status Filters */}
          <div style={{
            padding: '20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '12px' }}>
              Policy Conditions
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterConfig.hasPolicy || false}
                  onChange={(e) => setFilterConfig({ ...filterConfig, hasPolicy: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: t.primary }}
                />
                <span style={{ fontSize: '13px', color: t.text }}>Has at least one policy</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterConfig.hasExpiringPolicy || false}
                  onChange={(e) => setFilterConfig({ ...filterConfig, hasExpiringPolicy: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: t.primary }}
                />
                <span style={{ fontSize: '13px', color: t.text }}>Has policy expiring in next 30 days</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterConfig.hasNoPolicy || false}
                  onChange={(e) => setFilterConfig({ ...filterConfig, hasNoPolicy: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: t.primary }}
                />
                <span style={{ fontSize: '13px', color: t.text }}>Has no policies (prospects only)</span>
              </label>
            </div>
          </div>

          {/* Expiration Date Range */}
          <div style={{
            padding: '20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '12px' }}>
              Policy Expiration Date Range
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>From</label>
                <input
                  type="date"
                  value={filterConfig.expirationFrom || ''}
                  onChange={(e) => setFilterConfig({ ...filterConfig, expirationFrom: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: t.bgInput,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.text,
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>To</label>
                <input
                  type="date"
                  value={filterConfig.expirationTo || ''}
                  onChange={(e) => setFilterConfig({ ...filterConfig, expirationTo: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: t.bgInput,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.text,
                    fontSize: '13px'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Filter */}
      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '12px' }}>
          Search by Name or Email
        </label>
        <input
          type="text"
          placeholder="Search accounts..."
          value={filterConfig.search || ''}
          onChange={(e) => setFilterConfig({ ...filterConfig, search: e.target.value })}
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

      {/* Recipient Count */}
      <div style={{
        padding: '20px',
        backgroundColor: `${t.primary}10`,
        borderRadius: '12px',
        border: `1px solid ${t.primary}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
            Estimated Recipients
          </div>
          <div style={{ fontSize: '12px', color: t.textSecondary }}>
            Accounts with valid emails who haven't opted out
          </div>
        </div>
        <div style={{ fontSize: '28px', fontWeight: '700', color: t.primary }}>
          {isLoading ? '...' : (recipientCount || 0).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

// Review step
const ReviewStep = ({ template, filterConfig, subject, setSubject, name, setName, recipients, isLoadingRecipients, theme: t }) => {
  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
        Review & Send
      </h3>

      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
          Campaign Name
        </label>
        <input
          type="text"
          placeholder="e.g., December Newsletter"
          value={name}
          onChange={(e) => setName(e.target.value)}
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

      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
          Subject Line
        </label>
        <input
          type="text"
          placeholder="Email subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
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
        <p style={{ fontSize: '12px', color: t.textMuted, marginTop: '6px' }}>
          Use merge fields like {'{{first_name}}'} for personalization
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '16px'
      }}>
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '4px' }}>Template</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>{template?.name}</div>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '4px' }}>Recipients</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
            {isLoadingRecipients ? '...' : (recipients?.length || 0).toLocaleString()} accounts
          </div>
        </div>
      </div>

      {recipients && recipients.length > 0 && (
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: t.text, marginBottom: '12px' }}>
            Preview Recipients (first 10)
          </div>
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {recipients.slice(0, 10).map((recipient, i) => (
              <div
                key={recipient.account_unique_id}
                style={{
                  padding: '8px 0',
                  borderBottom: i < Math.min(9, recipients.length - 1) ? `1px solid ${t.border}` : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', color: t.text }}>
                    {recipient.primary_contact_first_name
                      ? `${recipient.primary_contact_first_name} ${recipient.primary_contact_last_name || ''}`
                      : recipient.name}
                  </div>
                  <div style={{ fontSize: '12px', color: t.textMuted }}>
                    {recipient.person_email || recipient.email}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: t.bgHover,
                  color: t.textSecondary,
                  borderRadius: '4px',
                  fontSize: '11px',
                  textTransform: 'capitalize'
                }}>
                  {recipient.account_status}
                </span>
              </div>
            ))}
          </div>
          {recipients.length > 10 && (
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '8px', textAlign: 'center' }}>
              +{recipients.length - 10} more recipients
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Main component
const MassEmailPage = ({ t }) => {
  const { userId } = useParams();
  const [showWizard, setShowWizard] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [filterConfig, setFilterConfig] = useState({
    statuses: [],
    search: '',
    notOptedOut: true,
    policyTypes: [],
    hasPolicy: false,
    hasExpiringPolicy: false,
    hasNoPolicy: false,
    expirationFrom: '',
    expirationTo: ''
  });
  const [subject, setSubject] = useState('');
  const [name, setName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch data
  const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } = useTemplates();
  const { data: batches, isLoading: loadingBatches, refetch: refetchBatches } = useMassEmailBatchesWithStats();
  const { data: recipientCount, isLoading: loadingCount } = useMassEmailRecipientCount(
    step >= 1 ? filterConfig : null
  );
  const { data: recipients, isLoading: loadingRecipients } = useMassEmailRecipients(
    step === 2 ? filterConfig : null,
    { limit: 100 }
  );

  const { createBatch, scheduleBatch } = useMassEmailMutations();
  const { createTemplate } = useTemplateMutations();

  const steps = ['Select Template', 'Filter Recipients', 'Review & Send'];

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setSubject(template.subject || '');
  };

  const handleCreateTemplate = async (templateData) => {
    const newTemplate = await createTemplate.mutateAsync(templateData);
    await refetchTemplates();
    return newTemplate;
  };

  const handleTemplateEditorClose = (savedTemplate) => {
    setShowTemplateEditor(false);
    if (savedTemplate) {
      setSelectedTemplate(savedTemplate);
      setSubject(savedTemplate.subject || '');
    }
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate || !subject) return;

    setIsSending(true);
    setError(null);

    try {
      // Create the batch
      const batch = await createBatch.mutateAsync({
        name: name || `Mass Email - ${new Date().toLocaleDateString()}`,
        subject,
        template_id: selectedTemplate.id,
        filter_config: filterConfig,
        total_recipients: recipientCount || 0
      });

      // Schedule it for immediate sending
      await scheduleBatch.mutateAsync({ batchId: batch.id });

      setSuccess(`Successfully scheduled ${recipientCount} emails for sending!`);
      setShowWizard(false);
      resetWizard();
      refetchBatches();
    } catch (err) {
      setError(err.message || 'Failed to send mass email');
    } finally {
      setIsSending(false);
    }
  };

  const resetWizard = () => {
    setStep(0);
    setSelectedTemplate(null);
    setFilterConfig({
      statuses: [],
      search: '',
      notOptedOut: true,
      policyTypes: [],
      hasPolicy: false,
      hasExpiringPolicy: false,
      hasNoPolicy: false,
      expirationFrom: '',
      expirationTo: ''
    });
    setSubject('');
    setName('');
  };

  const canProceed = () => {
    if (step === 0) return !!selectedTemplate;
    if (step === 1) return (recipientCount || 0) > 0;
    if (step === 2) return !!subject && !!name;
    return false;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Mass Email
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Send one-off emails to filtered recipients
          </p>
        </div>
        {!showWizard && (
          <button
            onClick={() => setShowWizard(true)}
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
            <span>+</span> New Campaign
          </button>
        )}
      </div>

      {/* Success message */}
      {success && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.success}15`,
          border: `1px solid ${t.success}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.success,
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ background: 'none', border: 'none', color: t.success, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {showWizard ? (
        <div style={{
          backgroundColor: t.bgCard,
          borderRadius: '16px',
          border: `1px solid ${t.border}`,
          padding: '24px'
        }}>
          <StepIndicator currentStep={step} steps={steps} theme={t} />

          {/* Error message */}
          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: `${t.danger}15`,
              border: `1px solid ${t.danger}30`,
              borderRadius: '8px',
              marginBottom: '16px',
              color: t.danger,
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Step content */}
          <div style={{ minHeight: '300px' }}>
            {step === 0 && (
              <TemplateStep
                selectedTemplate={selectedTemplate}
                onSelect={handleTemplateSelect}
                onCreateNew={() => setShowTemplateEditor(true)}
                templates={templates}
                isLoading={loadingTemplates}
                theme={t}
              />
            )}
            {step === 1 && (
              <RecipientsStep
                filterConfig={filterConfig}
                setFilterConfig={setFilterConfig}
                recipientCount={recipientCount}
                isLoading={loadingCount}
                theme={t}
              />
            )}
            {step === 2 && (
              <ReviewStep
                template={selectedTemplate}
                filterConfig={filterConfig}
                subject={subject}
                setSubject={setSubject}
                name={name}
                setName={setName}
                recipients={recipients}
                isLoadingRecipients={loadingRecipients}
                theme={t}
              />
            )}
          </div>

          {/* Navigation */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '24px',
            borderTop: `1px solid ${t.border}`,
            marginTop: '24px'
          }}>
            <button
              onClick={() => {
                if (step === 0) {
                  setShowWizard(false);
                  resetWizard();
                } else {
                  handleBack();
                }
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {step < 2 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                style={{
                  padding: '10px 24px',
                  backgroundColor: canProceed() ? t.primary : t.bgHover,
                  border: 'none',
                  borderRadius: '8px',
                  color: canProceed() ? '#fff' : t.textMuted,
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canProceed() || isSending}
                style={{
                  padding: '10px 24px',
                  backgroundColor: canProceed() && !isSending ? t.success : t.bgHover,
                  border: 'none',
                  borderRadius: '8px',
                  color: canProceed() && !isSending ? '#fff' : t.textMuted,
                  cursor: canProceed() && !isSending ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isSending ? 'Sending...' : 'Send Emails'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Recent campaigns */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
              Recent Campaigns
            </h2>

            {loadingBatches ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ padding: '16px', backgroundColor: t.bgCard, borderRadius: '10px', border: `1px solid ${t.border}` }}>
                    <Skeleton width="200px" height="18px" />
                    <div style={{ marginTop: '8px' }}><Skeleton width="300px" height="14px" /></div>
                  </div>
                ))}
              </div>
            ) : batches && batches.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {batches.map(batch => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    onView={(b) => console.log('View batch:', b)}
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
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
                  No campaigns yet
                </h3>
                <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
                  Create your first mass email campaign to reach your clients.
                </p>
                <button
                  onClick={() => setShowWizard(true)}
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
                  Create Your First Campaign
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <TemplateEditorModal
          template={null}
          onSave={handleCreateTemplate}
          onClose={handleTemplateEditorClose}
          theme={t}
        />
      )}
    </div>
  );
};

export default MassEmailPage;
