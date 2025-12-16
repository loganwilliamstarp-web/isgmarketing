import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  useAutomationsWithStats, 
  useActiveAutomations,
  useAutomationMutations 
} from '../hooks';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div 
    style={{ 
      width, 
      height, 
      backgroundColor: 'currentColor', 
      opacity: 0.1, 
      borderRadius: '4px' 
    }} 
  />
);

// Pre-built automation templates
const AUTOMATION_TEMPLATES = [
  { 
    id: 'welcome',
    name: 'Welcome Series', 
    desc: 'Send a series of welcome emails to new clients over their first 30 days', 
    icon: '📧', 
    category: 'Onboarding',
    defaultNodes: [
      { type: 'trigger', config: { frequency: 'daily', time: '09:00' } },
      { type: 'send_email', config: { templateKey: 'welcome_email' } },
      { type: 'delay', config: { days: 3 } },
      { type: 'send_email', config: { templateKey: 'getting_started' } },
    ]
  },
  { 
    id: 'renewal',
    name: 'Renewal Reminder', 
    desc: 'Automated reminders for upcoming policy renewals with customizable timing', 
    icon: '📅', 
    category: 'Retention',
    defaultNodes: [
      { type: 'trigger', config: { frequency: 'daily', time: '09:00' } },
      { type: 'send_email', config: { templateKey: 'renewal_30_day' } },
      { type: 'delay', config: { days: 14 } },
      { type: 'condition', config: { type: 'email_opened' } },
    ]
  },
  { 
    id: 'engagement',
    name: 'Engagement Campaign', 
    desc: 'Re-engage inactive clients with targeted email sequences', 
    icon: '📈', 
    category: 'Engagement',
    defaultNodes: [
      { type: 'trigger', config: { frequency: 'weekly', time: '10:00' } },
      { type: 'send_email', config: { templateKey: 'reengagement' } },
    ]
  },
  { 
    id: 'policy_update',
    name: 'Policy Update Alert', 
    desc: 'Notify clients about important policy changes and updates', 
    icon: '🔔', 
    category: 'Communication',
    defaultNodes: [
      { type: 'trigger', config: { frequency: 'immediate' } },
      { type: 'send_email', config: { templateKey: 'policy_update' } },
    ]
  },
];

// Status badge component
const StatusBadge = ({ status, theme: t }) => {
  const colors = {
    active: { bg: `${t.success}20`, text: t.success },
    paused: { bg: `${t.warning}20`, text: t.warning },
    draft: { bg: `${t.textMuted}20`, text: t.textMuted },
    archived: { bg: `${t.danger}20`, text: t.danger },
  };
  const c = colors[status] || colors.draft;
  
  return (
    <span style={{
      padding: '4px 10px',
      backgroundColor: c.bg,
      color: c.text,
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '500',
      textTransform: 'capitalize'
    }}>
      {status}
    </span>
  );
};

// Template card component
const TemplateCard = ({ template, onUse, theme: t }) => (
  <div style={{
    padding: '20px',
    backgroundColor: t.bgCard,
    borderRadius: '12px',
    border: `1px solid ${t.border}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
      <div style={{
        width: '40px',
        height: '40px',
        backgroundColor: t.bgHover,
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px'
      }}>
        {template.icon}
      </div>
      <span style={{
        padding: '4px 10px',
        backgroundColor: t.bgHover,
        borderRadius: '20px',
        fontSize: '11px',
        color: t.textSecondary
      }}>{template.category}</span>
    </div>
    <h4 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '6px' }}>
      {template.name}
    </h4>
    <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '16px', lineHeight: '1.5' }}>
      {template.desc}
    </p>
    <button 
      onClick={() => onUse(template)}
      style={{
        width: '100%',
        padding: '10px',
        backgroundColor: t.primary,
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500'
      }}
    >
      Use Template
    </button>
  </div>
);

// Automation row component
const AutomationRow = ({ automation, onEdit, onToggle, theme: t }) => {
  const stats = automation.stats || {};
  
  return (
    <tr style={{ borderTop: `1px solid ${t.border}` }}>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            backgroundColor: t.bgHover,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: t.text }}>
              {automation.name}
            </div>
            {automation.description && (
              <div style={{ fontSize: '12px', color: t.textMuted }}>
                {automation.description}
              </div>
            )}
          </div>
        </div>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <StatusBadge status={automation.status} theme={t} />
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {stats.totalSent?.toLocaleString() || 0}
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {stats.openRate ? `${Math.round(stats.openRate)}%` : '—'}
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {stats.clickRate ? `${Math.round(stats.clickRate)}%` : '—'}
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {stats.activeEnrollments || 0}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {automation.status === 'active' ? (
            <button 
              onClick={() => onToggle(automation.id, 'pause')}
              style={{
                padding: '6px 10px',
                backgroundColor: `${t.warning}15`,
                border: 'none',
                borderRadius: '6px',
                color: t.warning,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500'
              }}
            >
              Pause
            </button>
          ) : automation.status === 'paused' ? (
            <button 
              onClick={() => onToggle(automation.id, 'activate')}
              style={{
                padding: '6px 10px',
                backgroundColor: `${t.success}15`,
                border: 'none',
                borderRadius: '6px',
                color: t.success,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500'
              }}
            >
              Activate
            </button>
          ) : null}
          <button 
            onClick={() => onEdit(automation.id)}
            style={{
              padding: '6px 12px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  );
};

// Main Automations Page Component
const AutomationsPage = ({ t }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('my');
  
  // Fetch automations with stats
  const { 
    data: automations, 
    isLoading, 
    error 
  } = useAutomationsWithStats();
  
  // Mutations
  const { 
    activateAutomation, 
    pauseAutomation,
    createAutomation 
  } = useAutomationMutations();

  // Navigation handlers
  const handleCreateNew = () => {
    navigate(`/${userId}/automations/new`);
  };

  const handleUseTemplate = async (template) => {
    navigate(`/${userId}/automations/new`, { 
      state: { 
        templateId: template.id,
        templateName: template.name,
        defaultNodes: template.defaultNodes
      } 
    });
  };

  const handleEditAutomation = (automationId) => {
    navigate(`/${userId}/automations/${automationId}`);
  };

  const handleToggleAutomation = async (automationId, action) => {
    try {
      if (action === 'activate') {
        await activateAutomation.mutateAsync(automationId);
      } else {
        await pauseAutomation.mutateAsync(automationId);
      }
    } catch (err) {
      console.error(`Failed to ${action} automation:`, err);
    }
  };

  // Separate automations by status
  const activeAutomations = automations?.filter(a => a.status === 'active') || [];
  const pausedAutomations = automations?.filter(a => a.status === 'paused') || [];
  const draftAutomations = automations?.filter(a => a.status === 'draft') || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Automations
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Create and manage automated email workflows
          </p>
        </div>
        <button 
          onClick={handleCreateNew}
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
          <span>+</span> Create Custom
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
          Failed to load automations. Please try refreshing the page.
        </div>
      )}

      {/* Quick Stats */}
      {!isLoading && automations && (
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: t.success }}>{activeAutomations.length}</div>
            <div style={{ fontSize: '12px', color: t.textSecondary }}>Active</div>
          </div>
          <div style={{ width: '1px', backgroundColor: t.border }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: t.warning }}>{pausedAutomations.length}</div>
            <div style={{ fontSize: '12px', color: t.textSecondary }}>Paused</div>
          </div>
          <div style={{ width: '1px', backgroundColor: t.border }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: t.textMuted }}>{draftAutomations.length}</div>
            <div style={{ fontSize: '12px', color: t.textSecondary }}>Drafts</div>
          </div>
          <div style={{ width: '1px', backgroundColor: t.border }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: t.primary }}>
              {automations.reduce((sum, a) => sum + (a.stats?.totalSent || 0), 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: t.textSecondary }}>Total Sent</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '24px',
        backgroundColor: t.bgHover,
        padding: '4px',
        borderRadius: '10px',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setTab('my')}
          style={{
            padding: '10px 20px',
            backgroundColor: tab === 'my' ? t.bgCard : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: tab === 'my' ? t.text : t.textSecondary,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: tab === 'my' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          My Automations {automations && `(${automations.length})`}
        </button>
        <button
          onClick={() => setTab('templates')}
          style={{
            padding: '10px 20px',
            backgroundColor: tab === 'templates' ? t.bgCard : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: tab === 'templates' ? t.text : t.textSecondary,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: tab === 'templates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          Templates
        </button>
      </div>

      {/* Templates Tab */}
      {tab === 'templates' && (
        <>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
            Pre-built Templates
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {AUTOMATION_TEMPLATES.map((template) => (
              <TemplateCard 
                key={template.id}
                template={template}
                onUse={handleUseTemplate}
                theme={t}
              />
            ))}
          </div>
        </>
      )}

      {/* My Automations Tab */}
      {tab === 'my' && (
        <>
          {isLoading ? (
            <div style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              padding: '20px'
            }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', padding: '16px 0', borderTop: i > 0 ? `1px solid ${t.border}` : 'none' }}>
                  <Skeleton width="36px" height="36px" />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="200px" height="16px" />
                    <div style={{ marginTop: '8px' }}><Skeleton width="120px" height="12px" /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : automations?.length > 0 ? (
            <div style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: t.bgHover }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Automation
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Status
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Sent
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Open Rate
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Click Rate
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Enrolled
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {automations.map((automation) => (
                    <AutomationRow
                      key={automation.id}
                      automation={automation}
                      onEdit={handleEditAutomation}
                      onToggle={handleToggleAutomation}
                      theme={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              padding: '60px 20px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
                No automations yet
              </h3>
              <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
                Create your first automation to start sending targeted emails automatically.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setTab('templates')}
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
                  Browse Templates
                </button>
                <button
                  onClick={handleCreateNew}
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
                  Create Custom
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AutomationsPage;
