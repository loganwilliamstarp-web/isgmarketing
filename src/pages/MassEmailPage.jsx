import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  useTemplates,
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

// Template selection step
const TemplateStep = ({ selectedTemplate, onSelect, templates, isLoading, theme: t }) => {
  const [search, setSearch] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!search) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase())
    );
  }, [templates, search]);

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
        Select an Email Template
      </h3>

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
          {search ? 'No templates match your search' : 'No templates available'}
        </div>
      )}
    </div>
  );
};

// Recipients filter step
const RecipientsStep = ({ filterConfig, setFilterConfig, recipientCount, isLoading, theme: t }) => {
  const statuses = [
    { value: 'customer', label: 'Customers' },
    { value: 'prospect', label: 'Prospects' },
    { value: 'prior_customer', label: 'Prior Customers' },
    { value: 'lead', label: 'Leads' }
  ];

  const toggleStatus = (status) => {
    const currentStatuses = filterConfig.statuses || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];
    setFilterConfig({ ...filterConfig, statuses: newStatuses });
  };

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
        Filter Recipients
      </h3>

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
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [filterConfig, setFilterConfig] = useState({ statuses: [], search: '', notOptedOut: true });
  const [subject, setSubject] = useState('');
  const [name, setName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch data
  const { data: templates, isLoading: loadingTemplates } = useTemplates();
  const { data: batches, isLoading: loadingBatches, refetch: refetchBatches } = useMassEmailBatchesWithStats();
  const { data: recipientCount, isLoading: loadingCount } = useMassEmailRecipientCount(
    step >= 1 ? filterConfig : null
  );
  const { data: recipients, isLoading: loadingRecipients } = useMassEmailRecipients(
    step === 2 ? filterConfig : null,
    { limit: 100 }
  );

  const { createBatch, scheduleBatch } = useMassEmailMutations();

  const steps = ['Select Template', 'Filter Recipients', 'Review & Send'];

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setSubject(template.subject || '');
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
    setFilterConfig({ statuses: [], search: '', notOptedOut: true });
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
    </div>
  );
};

export default MassEmailPage;
