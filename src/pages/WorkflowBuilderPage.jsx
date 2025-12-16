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
  const { createAutomation, updateAutomation } = useAutomationMutations();
  
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
  
  // Loading state
  if (!isNew && isLoading) {
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
          <h1 style={{ 
            fontSize: '16px', 
            fontWeight: '600', 
            color: t?.text || '#fafafa',
            margin: 0 
          }}>
            {isNew ? 'Create Automation' : `Edit: ${automation?.name || 'Automation'}`}
          </h1>
          {automation?.status && (
            <span style={{
              padding: '4px 10px',
              backgroundColor: automation.status === 'active' 
                ? `${t?.success || '#22c55e'}20` 
                : `${t?.textMuted || '#71717a'}20`,
              color: automation.status === 'active' 
                ? (t?.success || '#22c55e')
                : (t?.textMuted || '#71717a'),
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '500',
              textTransform: 'capitalize'
            }}>
              {automation.status}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
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
      
      {/* Workflow Builder */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorkflowBuilder 
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
