import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAutomation, useAutomationMutations, useIsAdmin } from '../hooks';
import WorkflowBuilder from '../components/WorkflowBuilder';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: '#27272a', borderRadius: '4px' }} />
);

const WorkflowBuilderPage = ({ t }) => {
  const { userId, automationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isNew = !automationId || automationId === 'new';

  // Get template info from navigation state (if using a template)
  const templateInfo = location.state?.templateName || location.state?.templateId;

  // Check if user is admin
  const { data: isAdmin = false, isLoading: isAdminLoading } = useIsAdmin();

  // Load existing automation if editing
  const { data: automation, isLoading, error } = useAutomation(isNew ? null : automationId);

  // Check if this is a default automation that non-admins can't edit
  const isDefaultAutomation = automation?.is_default === true;
  const canEdit = isNew || !isDefaultAutomation || isAdmin;

  // Mutations
  const { createAutomation, updateAutomation, activateAutomation, pauseAutomation, duplicateAutomation } = useAutomationMutations();
  
  // Handle status toggle - saves immediately to database
  const handleStatusToggle = async () => {
    if (isNew) return;
    
    const isCurrentlyActive = automationData.status === 'active';
    const newStatus = isCurrentlyActive ? 'paused' : 'active';
    
    try {
      if (isCurrentlyActive) {
        await pauseAutomation.mutateAsync(automationId);
      } else {
        await activateAutomation.mutateAsync(automationId);
      }
      setAutomationData(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };
  
  // Local state for the builder
  const [automationData, setAutomationData] = useState({
    name: '',
    description: '',
    category: 'general',
    status: 'draft',
    send_time: '10:00',
    timezone: 'America/Chicago',
    frequency: 'Daily',
    filter_config: {},
    nodes: []
  });
  
  // Update local state when automation loads
  useEffect(() => {
    if (automation) {
      setAutomationData({
        name: automation.name || '',
        description: automation.description || '',
        category: automation.category || 'general',
        status: automation.status || 'draft',
        send_time: automation.send_time || '10:00',
        timezone: automation.timezone || 'America/Chicago',
        frequency: automation.frequency || 'Daily',
        filter_config: automation.filter_config || {},
        nodes: automation.nodes || []
      });
    }
  }, [automation]);
  
  // Handle save
  const handleSave = async (data) => {
    // Non-admins can't save changes to default automations
    if (!canEdit) {
      alert('You cannot edit default automations. Use "Clone & Edit" to create your own copy.');
      return;
    }

    try {
      if (isNew) {
        const newAutomation = await createAutomation.mutateAsync(data);
        // Navigate to the edit page for the new automation
        navigate(`/${userId}/automations/${newAutomation.id}`, { replace: true });
      } else {
        await updateAutomation.mutateAsync({
          automationId,
          updates: data
        });
      }
    } catch (err) {
      console.error('Failed to save automation:', err);
      alert('Failed to save automation. Please try again.');
    }
  };

  // Handle clone for non-admins viewing default automations
  const handleClone = async () => {
    try {
      const clonedAutomation = await duplicateAutomation.mutateAsync(automationId);
      // Navigate to the cloned automation
      navigate(`/${userId}/automations/${clonedAutomation.id}`, { replace: true });
    } catch (err) {
      console.error('Failed to clone automation:', err);
      alert('Failed to clone automation. Please try again.');
    }
  };
  
  // Handle back navigation
  const handleBack = () => {
    navigate(`/${userId}/automations`);
  };
  
  // Track the automation's updated_at to detect when fresh data loads
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Check if automationData has been populated from the query
  // Compare updated_at to ensure we have the latest data
  const isDataSynced = isNew || (automation && lastSyncedAt === automation.updated_at);

  // Update lastSyncedAt when we sync data
  useEffect(() => {
    if (automation?.updated_at) {
      setLastSyncedAt(automation.updated_at);
    }
  }, [automation?.updated_at]);

  // Loading state - wait for query AND state sync AND admin check
  if (!isNew && (isLoading || isAdminLoading || !isDataSynced)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'calc(100vh - 100px)',
        gap: '16px'
      }}>
        <div style={{ fontSize: '32px' }}>⏳</div>
        <div style={{ color: t?.textSecondary || '#a1a1aa' }}>Loading automation...</div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: 'calc(100vh - 100px)',
        gap: '16px'
      }}>
        <div style={{ fontSize: '48px' }}>😕</div>
        <h2 style={{ color: t?.text || '#fafafa', margin: 0 }}>Automation Not Found</h2>
        <p style={{ color: t?.textSecondary || '#a1a1aa' }}>
          We couldn't find the automation you're looking for.
        </p>
        <button
          onClick={handleBack}
          style={{
            padding: '10px 20px',
            backgroundColor: t?.primary || '#3b82f6',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Back to Automations
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ 
      margin: '-24px', // Offset the parent padding
      height: 'calc(100vh - 49px)', // Full height minus top bar
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header bar */}
      <div style={{
        padding: '12px 24px',
        borderBottom: `1px solid ${t?.border || '#27272a'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: t?.bgCard || '#18181b',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleBack}
            style={{
              background: 'none',
              border: 'none',
              color: t?.textSecondary || '#a1a1aa',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            ←
          </button>
          <h1 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: t?.text || '#fafafa',
            margin: 0
          }}>
            {isNew ? 'Create Automation' : canEdit ? `Edit: ${automation?.name || 'Automation'}` : `View: ${automation?.name || 'Automation'}`}
          </h1>
          {/* Default badge for default automations */}
          {isDefaultAutomation && (
            <span style={{
              padding: '4px 8px',
              backgroundColor: `${t?.primary || '#3b82f6'}20`,
              color: t?.primary || '#3b82f6',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase'
            }}>
              Default
            </span>
          )}
          {/* Read-only indicator for non-admins viewing defaults */}
          {!canEdit && (
            <span style={{
              padding: '4px 8px',
              backgroundColor: `${t?.warning || '#f59e0b'}20`,
              color: t?.warning || '#f59e0b',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              Read Only
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Status Toggle - always available for users to control on/off */}
          {!isNew && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: t?.textSecondary || '#a1a1aa' }}>
                {automationData.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={handleStatusToggle}
                disabled={activateAutomation.isPending || pauseAutomation.isPending}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: automationData.status === 'active'
                    ? (t?.success || '#22c55e')
                    : (t?.bgHover || '#27272a'),
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.2s',
                  opacity: (activateAutomation.isPending || pauseAutomation.isPending) ? 0.6 : 1
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  position: 'absolute',
                  top: '3px',
                  left: automationData.status === 'active' ? '23px' : '3px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  pointerEvents: 'none'
                }} />
              </button>
            </div>
          )}

          {/* Clone button for non-admins viewing default automations */}
          {!canEdit && (
            <button
              onClick={handleClone}
              disabled={duplicateAutomation.isPending}
              style={{
                padding: '8px 16px',
                backgroundColor: t?.bgHover || '#27272a',
                border: `1px solid ${t?.border || '#3f3f46'}`,
                borderRadius: '6px',
                color: t?.text || '#fafafa',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                opacity: duplicateAutomation.isPending ? 0.7 : 1
              }}
            >
              {duplicateAutomation.isPending ? 'Cloning...' : 'Clone & Edit'}
            </button>
          )}

          {/* Save button - only for admins or non-default automations */}
          {canEdit && (
            <button
              onClick={() => handleSave(automationData)}
              disabled={createAutomation.isPending || updateAutomation.isPending}
              style={{
                padding: '8px 16px',
                backgroundColor: t?.primary || '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                opacity: (createAutomation.isPending || updateAutomation.isPending) ? 0.7 : 1
              }}
            >
              {(createAutomation.isPending || updateAutomation.isPending)
                ? 'Saving...'
                : isNew ? 'Create' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
      
      {/* Workflow Builder - key uses updated_at to force remount when data reloads */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorkflowBuilder
          key={`${automationId || 'new'}-${automation?.updated_at || 'new'}`}
          t={t}
          automation={automationData}
          onUpdate={setAutomationData}
          onSave={handleSave}
        />
      </div>
    </div>
  );
};

export default WorkflowBuilderPage;
