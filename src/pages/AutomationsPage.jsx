import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAutomationsWithStats,
  useAutomationMutations,
  useVerifiedSenderDomains,
  useEffectiveOwner
} from '../hooks';
import { useAuth } from '../contexts/AuthContext';
import { useMasterAutomations, useMasterAutomationMutations } from '../hooks/useAdmin';
import CollapsibleAgentSection, { AgentGroupControls, groupItemsByOwner } from '../components/CollapsibleAgentSection';

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

// Create Master Automation Modal
const CreateMasterAutomationModal = ({ onSave, onClose, theme: t }) => {
  const [name, setName] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('welcome');
  const [sendTime, setSendTime] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !defaultKey) return;
    setIsSubmitting(true);
    try {
      await onSave({
        name,
        default_key: defaultKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        description,
        category,
        send_time: sendTime,
        timezone: 'America/New_York',
        frequency: 'once',
        version: 1,
        filter_config: {},
        nodes: []
      });
      onClose();
    } catch (err) {
      console.error('Failed to create master automation:', err);
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
        width: '500px',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 101,
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
            Create Master Automation
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}
          >
            x
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Automation Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Welcome Email - Personal Lines"
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
              Default Key * <span style={{ color: t.textMuted, fontWeight: '400' }}>(unique identifier)</span>
            </label>
            <input
              type="text"
              value={defaultKey}
              onChange={(e) => setDefaultKey(e.target.value)}
              placeholder="e.g., welcome_personal"
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
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this automation..."
              rows={2}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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

            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Send Time
              </label>
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
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

          <div style={{
            padding: '12px',
            backgroundColor: `${t.warning}15`,
            border: `1px solid ${t.warning}30`,
            borderRadius: '8px',
            fontSize: '13px',
            color: t.text
          }}>
            <strong>Note:</strong> This creates the master automation. You can edit the workflow after creation,
            then use "Sync to Users" to push it to all user accounts.
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
            disabled={isSubmitting || !name || !defaultKey}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: isSubmitting || !name || !defaultKey ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Master Automation'}
          </button>
        </div>
      </div>
    </>
  );
};

// Master automation row component (for admin viewing master templates)
const MasterAutomationRow = ({ automation, onEdit, onSync, syncing, theme: t }) => {
  return (
    <tr
      onClick={() => onEdit(automation.default_key)}
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
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {automation.category || '—'}
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        {automation.send_time || '—'}
      </td>
      <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
        v{automation.version || 1}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onSync(automation.default_key); }}
            disabled={syncing}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.textSecondary,
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              opacity: syncing ? 0.5 : 1
            }}
          >
            {syncing ? 'Syncing...' : 'Sync to Users'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(automation.default_key); }}
            style={{
              padding: '6px 12px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Edit Master
          </button>
        </div>
      </td>
    </tr>
  );
};

// Automation row component
const AutomationRow = ({ automation, onEdit, onToggle, onDelete, hasVerifiedDomain, theme: t }) => {
  const stats = automation.stats || {};
  const isActive = automation.status === 'active';
  // Can only activate if has verified domain (can always pause)
  const canToggle = isActive || hasVerifiedDomain;
  // Can only delete non-default automations
  const canDelete = automation.is_default !== true;

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
            onClick={(e) => {
              e.stopPropagation();
              if (canToggle) onToggle(automation.id, isActive ? 'pause' : 'activate');
            }}
            disabled={!canToggle}
            title={!canToggle ? 'Add a verified sender domain to activate automations' : ''}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: isActive ? t.success : t.bgHover,
              cursor: canToggle ? 'pointer' : 'not-allowed',
              position: 'relative',
              transition: 'background-color 0.2s',
              flexShrink: 0,
              opacity: canToggle ? 1 : 0.5
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
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(automation.id, automation.name); }}
              style={{
                padding: '6px 12px',
                backgroundColor: 'transparent',
                border: `1px solid ${t.danger}40`,
                borderRadius: '6px',
                color: t.danger,
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// Main Automations Page Component
const AutomationsPage = ({ t }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('automations');
  const [syncingKey, setSyncingKey] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandAllTrigger, setExpandAllTrigger] = useState(null); // null, 'expand', or 'collapse'

  // Check if admin is viewing multiple users (master view mode)
  const { isAdmin, isAgencyAdmin, user } = useAuth();
  const { isMultiOwner } = useEffectiveOwner();
  const showMasterView = isAdmin && isMultiOwner;
  // Agency admin viewing all agents gets grouped view
  const showAgencyGroupedView = !isAdmin && isAgencyAdmin && isMultiOwner;

  // Check for verified sender domains (only needed for user view)
  const { data: verifiedDomains, isLoading: loadingDomains } = useVerifiedSenderDomains();
  const hasVerifiedDomain = (verifiedDomains?.length || 0) > 0;

  // Fetch master automations (for admin master view)
  const {
    data: masterAutomations,
    isLoading: masterLoading,
    error: masterError
  } = useMasterAutomations();

  // Fetch user automations with stats (for user view)
  // Include owner info when agency admin is viewing all agents (for grouping)
  const {
    data: automations,
    isLoading,
    error
  } = useAutomationsWithStats({ includeOwnerInfo: showAgencyGroupedView });

  // Mutations for user automations
  const {
    activateAutomation,
    pauseAutomation,
    deleteAutomation
  } = useAutomationMutations();

  // Mutations for master automations
  const { syncMasterAutomation, createMasterAutomation } = useMasterAutomationMutations();

  // Handler for creating master automation
  const handleCreateMasterAutomation = async (automationData) => {
    await createMasterAutomation.mutateAsync(automationData);
  };

  // Navigation handlers
  const handleCreateNew = () => {
    navigate(`/${userId}/automations/new`);
  };

  const handleEditAutomation = (automationId) => {
    navigate(`/${userId}/automations/${automationId}`);
  };

  const handleEditMasterAutomation = (defaultKey) => {
    navigate(`/${userId}/automations/master/${defaultKey}`);
  };

  const handleSyncMasterAutomation = async (defaultKey) => {
    try {
      setSyncingKey(defaultKey);
      await syncMasterAutomation.mutateAsync(defaultKey);
    } catch (err) {
      console.error('Failed to sync master automation:', err);
    } finally {
      setSyncingKey(null);
    }
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

  const handleDeleteAutomation = async (automationId, automationName) => {
    if (!window.confirm(`Are you sure you want to delete "${automationName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteAutomation.mutateAsync(automationId);
    } catch (err) {
      console.error('Failed to delete automation:', err);
      alert('Failed to delete automation. Please try again.');
    }
  };

  // Separate automations by type (default vs user-created)
  const defaultAutomations = automations?.filter(a => a.is_default === true) || [];
  const userAutomations = automations?.filter(a => a.is_default !== true) || [];

  // Separate automations by status (for stats)
  const activeAutomations = automations?.filter(a => a.status === 'active') || [];
  const pausedAutomations = automations?.filter(a => a.status === 'paused') || [];
  const draftAutomations = automations?.filter(a => a.status === 'draft') || [];

  // MASTER VIEW - Admin viewing all agencies
  if (showMasterView) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
              Master Automations
            </h1>
            <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
              Edit master automation templates that sync to all users
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
              gap: '6px'
            }}
          >
            <span>+</span> Create Master Automation
          </button>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <CreateMasterAutomationModal
            onSave={handleCreateMasterAutomation}
            onClose={() => setShowCreateModal(false)}
            theme={t}
          />
        )}

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
            Failed to load master automations. Please try refreshing the page.
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
          <strong>Admin View:</strong> Changes to master automations will sync to all user accounts.
          Users can enable/disable automations but cannot modify the workflow structure.
        </div>

        {/* Master Automations Table */}
        {masterLoading ? (
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
        ) : masterAutomations && masterAutomations.length > 0 ? (
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
                    Category
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                    Send Time
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                    Version
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {masterAutomations.map((automation) => (
                  <MasterAutomationRow
                    key={automation.default_key}
                    automation={automation}
                    onEdit={handleEditMasterAutomation}
                    onSync={handleSyncMasterAutomation}
                    syncing={syncingKey === automation.default_key}
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
              No master automations
            </h3>
            <p style={{ fontSize: '14px', color: t.textSecondary }}>
              Master automations will appear here when configured.
            </p>
          </div>
        )}
      </div>
    );
  }

  // AGENCY ADMIN GROUPED VIEW - Agency admin viewing all agents
  if (showAgencyGroupedView) {
    // Group automations by owner
    const agentGroups = groupItemsByOwner(automations || [], user?.id);

    // Handle expand/collapse all
    const handleExpandAll = () => {
      setExpandAllTrigger('expand');
      // Reset trigger after a tick
      setTimeout(() => setExpandAllTrigger(null), 100);
    };

    const handleCollapseAll = () => {
      setExpandAllTrigger('collapse');
      // Reset trigger after a tick
      setTimeout(() => setExpandAllTrigger(null), 100);
    };

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
              Automations
            </h1>
            <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
              View and manage automations for all agents in your agency
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
              <div style={{ fontSize: '24px', fontWeight: '700', color: t.textMuted }}>{agentGroups.length}</div>
              <div style={{ fontSize: '12px', color: t.textSecondary }}>Agents</div>
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

        {/* Expand/Collapse Controls */}
        {!isLoading && agentGroups.length > 0 && (
          <AgentGroupControls
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            theme={t}
          />
        )}

        {/* Loading State */}
        {isLoading && (
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
        )}

        {/* Agent Groups */}
        {!isLoading && agentGroups.length > 0 && agentGroups.map((group) => (
          <CollapsibleAgentSection
            key={group.agentId}
            agentId={group.agentId}
            agentName={group.agentName}
            agentEmail={group.agentEmail}
            itemCount={group.items.length}
            activeCount={group.items.filter(a => a.status === 'active').length}
            isCurrentUser={group.agentId === user?.id}
            forceExpanded={expandAllTrigger === 'expand'}
            forceCollapsed={expandAllTrigger === 'collapse'}
            theme={t}
          >
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
                {group.items.map((automation) => (
                  <AutomationRow
                    key={automation.id}
                    automation={automation}
                    onEdit={handleEditAutomation}
                    onToggle={handleToggleAutomation}
                    onDelete={handleDeleteAutomation}
                    hasVerifiedDomain={hasVerifiedDomain}
                    theme={t}
                  />
                ))}
              </tbody>
            </table>
          </CollapsibleAgentSection>
        ))}

        {/* Empty State */}
        {!isLoading && agentGroups.length === 0 && (
          <div style={{
            padding: '60px 20px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
              No automations found
            </h3>
            <p style={{ fontSize: '14px', color: t.textSecondary }}>
              No automations have been created by agents in your agency yet.
            </p>
          </div>
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

      {/* No verified domain warning */}
      {!loadingDomains && !hasVerifiedDomain && (
        <div style={{
          padding: '20px',
          backgroundColor: `${t.warning}15`,
          border: `1px solid ${t.warning}30`,
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontWeight: '600', color: t.text, marginBottom: '4px' }}>
              Sender Domain Required
            </div>
            <div style={{ fontSize: '14px', color: t.textSecondary }}>
              You need to add and verify a sender domain before you can activate automations.
              This ensures emails are delivered from your agency's domain.
            </div>
          </div>
          <button
            onClick={() => navigate(`/${userId}/settings`)}
            style={{
              padding: '10px 20px',
              backgroundColor: t.warning,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            Add Domain
          </button>
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
                      onDelete={handleDeleteAutomation}
                      hasVerifiedDomain={hasVerifiedDomain}
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
                      onDelete={handleDeleteAutomation}
                      hasVerifiedDomain={hasVerifiedDomain}
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
