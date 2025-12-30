import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAutomation, useAutomationMutations } from '../hooks';
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
  
  // Load existing automation if editing
  const { data: automation, isLoading, error } = useAutomation(isNew ? null : automationId);
  
  // Mutations
  const { createAutomation, updateAutomation, activateAutomation, pauseAutomation } = useAutomationMutations();
  
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
  
  // Handle back navigation
  const handleBack = () => {
    navigate(`/${userId}/automations`);
  };
  
  // Check if automationData has been populated from the query
  // We need to wait for both the query AND the useEffect to run
  const isDataSynced = isNew || (automation && automationData.name === automation.name);

  // Loading state - wait for query AND state sync
  if (!isNew && (isLoading || !isDataSynced)) {
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
            {isNew ? 'Create Automation' : `Edit: ${automation?.name || 'Automation'}`}
          </h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Status Toggle */}
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
        </div>
      </div>
      
      {/* Workflow Builder - key includes data hash to force remount when data loads */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorkflowBuilder
          key={`${automationId || 'new'}-${automation?.id || 'loading'}`}
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
