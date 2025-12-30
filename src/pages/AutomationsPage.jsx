import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAutomationsWithStats,
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


// Automation row component
const AutomationRow = ({ automation, onEdit, onToggle, theme: t }) => {
  const stats = automation.stats || {};
  const isActive = automation.status === 'active';

  return (
    <tr
      onClick={() => onEdit(automation.id)}
      style={{
        borderTop: `1px solid ${t.border}`,
        cursor: 'pointer',
        transition: 'background-color 0.15s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = t.bgHover}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(automation.id, isActive ? 'pause' : 'activate'); }}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: isActive ? t.success : t.bgHover,
              cursor: 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
              flexShrink: 0
            }}
          >
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              position: 'absolute',
              top: '3px',
              left: isActive ? '23px' : '3px',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              pointerEvents: 'none'
            }} />
          </button>
          <span style={{ 
            fontSize: '12px', 
            color: isActive ? t.success : t.textMuted,
            fontWeight: '500'
          }}>
            {isActive ? 'Active' : automation.status === 'draft' ? 'Draft' : 'Paused'}
          </span>
        </div>
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
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(automation.id); }}
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
      </td>
    </tr>
  );
};

// Main Automations Page Component
const AutomationsPage = ({ t }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('automations');
  
  // Fetch automations with stats
  const { 
    data: automations, 
    isLoading, 
    error 
  } = useAutomationsWithStats();
  
  // Mutations
  const {
    activateAutomation,
    pauseAutomation
  } = useAutomationMutations();

  // Navigation handlers
  const handleCreateNew = () => {
    navigate(`/${userId}/automations/new`);
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

  // Separate automations by type (default vs user-created)
  const defaultAutomations = automations?.filter(a => a.is_default === true) || [];
  const userAutomations = automations?.filter(a => a.is_default !== true) || [];

  // Separate automations by status (for stats)
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
          onClick={() => setTab('automations')}
          style={{
            padding: '10px 20px',
            backgroundColor: tab === 'automations' ? t.bgCard : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: tab === 'automations' ? t.text : t.textSecondary,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: tab === 'automations' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          Automations {defaultAutomations.length > 0 && `(${defaultAutomations.length})`}
        </button>
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
          My Automations {userAutomations.length > 0 && `(${userAutomations.length})`}
        </button>
      </div>

      {/* Automations Tab - Default automations */}
      {tab === 'automations' && (
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
          ) : defaultAutomations.length > 0 ? (
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
                  {defaultAutomations.map((automation) => (
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
                No default automations
              </h3>
              <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
                Default automations will appear here when available.
              </p>
            </div>
          )}
        </>
      )}

      {/* My Automations Tab - User-created/cloned automations */}
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
          ) : userAutomations.length > 0 ? (
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
                  {userAutomations.map((automation) => (
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
                No custom automations yet
              </h3>
              <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
                Create your own automation or clone an existing one to get started.
              </p>
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
          )}
        </>
      )}
    </div>
  );
};

export default AutomationsPage;
