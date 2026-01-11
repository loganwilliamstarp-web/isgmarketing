import React, { useState, useEffect, useRef } from 'react';
import FilterBuilder, { formatRuleText } from './FilterBuilder';
import { useMassEmailRecipients, useMassEmailRecipientCount, useTemplates } from '../hooks';
import { useMasterTemplates } from '../hooks/useAdmin';

// Default dark theme (fallback)
const defaultTheme = {
  bg: '#09090b',
  bgCard: '#18181b',
  bgSidebar: '#18181b',
  bgHover: '#27272a',
  bgInput: '#27272a',
  border: '#27272a',
  borderLight: '#3f3f46',
  text: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  purple: '#a78bfa',
};

// ============================================
// WORKFLOW BUILDER COMPONENT
// ============================================

const defaultNodes = [
  {
    id: 'entry-criteria',
    type: 'entry_criteria',
    title: 'Entry Criteria',
    subtitle: 'Define who enters this automation',
    config: {
      filterConfig: { groups: [] },
      reentry: {
        enabled: false,
        type: 'never', // 'never', 'after_days'
        days: 30
      },
      pacing: {
        enabled: false,
        spreadOverDays: 7,
        allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri'] // Default to weekdays
      }
    }
  },
  {
    id: 'trigger',
    type: 'trigger',
    title: 'Trigger',
    subtitle: 'Daily at 09:00 (Central)',
    config: { time: '09:00', timezone: 'America/Chicago', frequency: 'Daily' }
  },
  {
    id: 'node-1',
    type: 'send_email',
    title: 'Send Email',
    subtitle: 'Select template...',
    config: { template: '' }
  }
];

const WorkflowBuilder = ({ t: themeProp, automation, onUpdate, onSave, canEdit = true, isMasterEdit = false }) => {
  // Use provided theme or default
  const t = themeProp || defaultTheme;

  // Use automation nodes if they exist and have items, otherwise use defaults
  // Also ensure entry_criteria node exists and has all required config properties
  const getInitialNodes = () => {
    if (!automation?.nodes || automation.nodes.length === 0) {
      return defaultNodes;
    }

    // Check if entry_criteria node exists
    const hasEntryCriteria = automation.nodes.some(n => n.type === 'entry_criteria');

    // Build the entry_criteria node with filter_config from automation
    const entryCriteriaNode = {
      id: 'entry-criteria',
      type: 'entry_criteria',
      title: 'Entry Criteria',
      subtitle: 'Define who enters this automation',
      config: {
        filterConfig: automation.filter_config || { groups: [] },
        reentry: {
          enabled: false,
          type: 'never',
          days: 30
        },
        pacing: {
          enabled: false,
          spreadOverDays: 7,
          allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri']
        }
      }
    };

    // Process existing nodes and ensure entry_criteria has proper config
    let processedNodes = automation.nodes.map(node => {
      if (node.type === 'entry_criteria') {
        return {
          ...node,
          config: {
            ...node.config,
            filterConfig: node.config?.filterConfig || automation.filter_config || { groups: [] },
            reentry: node.config?.reentry || {
              enabled: false,
              type: 'never',
              days: 30
            },
            pacing: node.config?.pacing || {
              enabled: false,
              spreadOverDays: 7,
              allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri']
            }
          }
        };
      }
      return node;
    });

    // If no entry_criteria node exists, add it at the beginning
    if (!hasEntryCriteria) {
      processedNodes = [entryCriteriaNode, ...processedNodes];
    }

    return processedNodes;
  };

  const [nodes, setNodes] = useState(getInitialNodes);

  const [selectedNode, setSelectedNode] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [hoveredGroupTooltip, setHoveredGroupTooltip] = useState(null); // { contactId, groupIndex, x, y }

  // Fetch email templates for send_email node
  // When editing a master automation, only show master templates
  const { data: regularTemplates = [], isLoading: regularTemplatesLoading } = useTemplates();
  const { data: masterTemplates = [], isLoading: masterTemplatesLoading } = useMasterTemplates();

  // Use master templates when editing a master automation, otherwise use regular templates
  const templates = isMasterEdit ? masterTemplates : regularTemplates;
  const templatesLoading = isMasterEdit ? masterTemplatesLoading : regularTemplatesLoading;

  // Get stats from automation data (for workflow node tracking)
  const nodeStats = automation?.nodeStats || {};

  // Get entry criteria node's config
  const entryCriteriaNode = nodes.find(n => n.type === 'entry_criteria');
  const [filterConfig, setFilterConfig] = useState(entryCriteriaNode?.config?.filterConfig || { groups: [] });
  const [reentryConfig, setReentryConfig] = useState(entryCriteriaNode?.config?.reentry || {
    enabled: false,
    type: 'never',
    days: 30
  });
  const [pacingConfig, setPacingConfig] = useState(entryCriteriaNode?.config?.pacing || {
    enabled: false,
    spreadOverDays: 7,
    allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri']
  });

  // No need for sync effects - parent guarantees data is ready before mounting
  // The initial state is set correctly from the automation prop above

  // Update the entry criteria node when filter config changes
  const updateFilterConfig = (newConfig) => {
    setFilterConfig(newConfig);
    setNodes(prev => prev.map(node =>
      node.type === 'entry_criteria'
        ? { ...node, config: { ...node.config, filterConfig: newConfig } }
        : node
    ));
  };

  // Update the entry criteria node when reentry config changes
  const updateReentryConfig = (newConfig) => {
    setReentryConfig(newConfig);
    setNodes(prev => prev.map(node =>
      node.type === 'entry_criteria'
        ? { ...node, config: { ...node.config, reentry: newConfig } }
        : node
    ));
  };

  // Update the entry criteria node when pacing config changes
  const updatePacingConfig = (newConfig) => {
    setPacingConfig(newConfig);
    setNodes(prev => prev.map(node =>
      node.type === 'entry_criteria'
        ? { ...node, config: { ...node.config, pacing: newConfig } }
        : node
    ));
  };

  // Sync nodes back to parent whenever they change (debounced to prevent rapid updates)
  const syncTimeoutRef = useRef(null);
  useEffect(() => {
    if (onUpdate) {
      // Clear any pending sync
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      // Debounce the sync to parent to prevent rapid re-renders during typing
      syncTimeoutRef.current = setTimeout(() => {
        onUpdate(prev => ({
          ...prev,
          nodes: nodes,
          // Also sync filter_config at the top level for backwards compatibility
          filter_config: filterConfig
        }));
      }, 100);
    }
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [nodes, filterConfig, reentryConfig, pacingConfig]);

  // Check if filter config has valid filters
  const hasFilters = filterConfig?.groups?.some(g => g.rules?.some(r => r.field && r.operator));

  // Fetch potential enrollees based on filter criteria (only when preview modal is open)
  // When in master edit mode, fetch ALL accounts across the system to test filters properly
  const { data: potentialEnrollees, isLoading: loadingEnrollees } = useMassEmailRecipients(
    showPreviewModal && hasFilters ? filterConfig : null,
    { limit: 500, allAccounts: isMasterEdit }
  );

  // Get count of potential enrollees
  // When in master edit mode, count ALL accounts to show total potential reach
  const { data: enrolleeCount, isLoading: loadingCount } = useMassEmailRecipientCount(
    hasFilters ? filterConfig : null,
    { allAccounts: isMasterEdit }
  );

  // Calculate paced scheduled dates for preview
  const getPacedScheduleDates = (enrolleeCount) => {
    if (!pacingConfig.enabled || !enrolleeCount) return [];

    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const allowedDayNumbers = (pacingConfig.allowedDays || ['mon', 'tue', 'wed', 'thu', 'fri']).map(d => dayMap[d]);
    const spreadOverDays = pacingConfig.spreadOverDays || 7;

    // Build list of valid send dates starting from today
    const validDates = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const maxLookAhead = spreadOverDays * 2;
    for (let i = 0; i < maxLookAhead && validDates.length < spreadOverDays; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      if (allowedDayNumbers.includes(checkDate.getDay())) {
        validDates.push(new Date(checkDate));
      }
    }

    if (validDates.length === 0) {
      for (let i = 0; i < spreadOverDays; i++) {
        const checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() + i);
        validDates.push(checkDate);
      }
    }

    // Calculate how many per day
    const emailsPerDay = Math.ceil(enrolleeCount / validDates.length);

    // Return array mapping index to date
    return validDates.map((date, dayIndex) => ({
      date,
      startIndex: dayIndex * emailsPerDay,
      endIndex: Math.min((dayIndex + 1) * emailsPerDay - 1, enrolleeCount - 1)
    }));
  };

  const nodeTypes = {
    entry_criteria: { icon: '🎯', color: '#8b5cf6', label: 'Entry Criteria' },
    trigger: { icon: '⚡', color: t.primary, label: 'Trigger' },
    send_email: { icon: '📧', color: t.success, label: 'Send Email' },
    delay: { icon: '⏱', color: t.warning, label: 'Delay' },
    condition: { icon: '🔀', color: t.purple, label: 'Condition' },
    field_condition: { icon: '📋', color: '#ec4899', label: 'Field Check' },
    update_field: { icon: '✏️', color: '#06b6d4', label: 'Update Field' },
    end: { icon: '🏁', color: t.textMuted, label: 'End' }
  };

  const availableNodes = [
    { type: 'send_email', label: 'Send Email', desc: 'Send an email template', icon: '📧' },
    { type: 'delay', label: 'Delay', desc: 'Wait before continuing', icon: '⏱' },
    { type: 'condition', label: 'Email Engagement', desc: 'Branch on open/click', icon: '📬' },
    { type: 'field_condition', label: 'Field Condition', desc: 'Branch on field value', icon: '🔀' },
    { type: 'update_field', label: 'Update Field', desc: 'Update a record field', icon: '✏️' },
    { type: 'end', label: 'End', desc: 'Stop automation', icon: '🏁' },
  ];

  const addNode = (afterNodeId, nodeType, branch = null) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeType,
      title: availableNodes.find(n => n.type === nodeType)?.label || nodeType,
      subtitle: 'Configure...',
      config: {}
    };
    if (nodeType === 'condition' || nodeType === 'field_condition') {
      newNode.branches = { yes: [], no: [] };
    }

    if (branch) {
      setNodes(prev => {
        const updateBranches = (nodeList) => nodeList.map(node => {
          if (node.id === afterNodeId && node.branches) {
            return { ...node, branches: { ...node.branches, [branch]: [...node.branches[branch], newNode] } };
          }
          if (node.branches) {
            return { ...node, branches: { yes: updateBranches(node.branches.yes), no: updateBranches(node.branches.no) } };
          }
          return node;
        });
        return updateBranches(prev);
      });
    } else {
      const index = nodes.findIndex(n => n.id === afterNodeId);
      const newNodes = [...nodes];
      newNodes.splice(index + 1, 0, newNode);
      setNodes(newNodes);
    }
    setShowAddMenu(null);
    setSelectedNode(newNode.id);
  };

  const deleteNode = (nodeId) => {
    // Don't allow deleting entry_criteria or trigger nodes
    setNodes(prev => prev.filter(n => n.id !== nodeId && n.id !== 'trigger' && n.id !== 'entry-criteria'));
    if (selectedNode === nodeId) setSelectedNode(null);
  };

  // Update a node's properties (config, subtitle, etc.)
  const updateNode = (nodeId, updates) => {
    setNodes(prev => {
      // Helper to recursively update nodes in branches
      const updateInList = (nodeList) => nodeList.map(node => {
        if (node.id === nodeId) {
          return { ...node, ...updates };
        }
        if (node.branches) {
          return {
            ...node,
            branches: {
              yes: updateInList(node.branches.yes || []),
              no: updateInList(node.branches.no || [])
            }
          };
        }
        return node;
      });
      return updateInList(prev);
    });
  };

  // Get filter summary for display
  const getFilterSummary = () => {
    const groups = filterConfig?.groups || [];
    const totalFilters = groups.reduce((sum, g) => sum + (g.rules?.filter(r => r.field && r.operator).length || 0), 0);
    if (totalFilters === 0) return 'No filters defined';
    return `${totalFilters} filter${totalFilters !== 1 ? 's' : ''} in ${groups.length} group${groups.length !== 1 ? 's' : ''}`;
  };

  // Helper to format node stats
  const getNodeStatsDisplay = (nodeId, nodeType) => {
    const stats = nodeStats[nodeId] || {};
    if (nodeType === 'entry_criteria') {
      return stats.entered ? `${stats.entered.toLocaleString()} entered` : null;
    }
    if (nodeType === 'trigger') {
      return stats.processed ? `${stats.processed.toLocaleString()} processed` : null;
    }
    if (nodeType === 'send_email') {
      if (stats.sent) {
        return `${stats.sent.toLocaleString()} sent`;
      }
    }
    if (nodeType === 'delay') {
      return stats.waiting ? `${stats.waiting.toLocaleString()} waiting` : null;
    }
    if (nodeType === 'condition' || nodeType === 'field_condition') {
      return stats.evaluated ? `${stats.evaluated.toLocaleString()} evaluated` : null;
    }
    return null;
  };

  // Node Component
  const WorkflowNode = ({ node }) => {
    const typeConfig = nodeTypes[node.type] || nodeTypes.send_email;
    const isSelected = selectedNode === node.id;
    const isEntryCriteria = node.type === 'entry_criteria';
    const isTrigger = node.type === 'trigger';
    const isProtected = isEntryCriteria || isTrigger; // Can't delete these
    const statsDisplay = getNodeStatsDisplay(node.id, node.type);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          onClick={() => {
            setSelectedNode(node.id);
          }}
          style={{
            width: '320px',
            backgroundColor: t.bgCard,
            border: isSelected ? `2px solid ${typeConfig.color}` : `1px solid ${t.border}`,
            borderRadius: '12px',
            padding: '16px 18px',
            cursor: 'pointer',
            position: 'relative'
          }}
        >
          {/* Stats badge */}
          {statsDisplay && (
            <div style={{
              position: 'absolute',
              top: '-10px',
              right: '12px',
              padding: '4px 10px',
              backgroundColor: typeConfig.color,
              color: '#fff',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              {statsDisplay}
            </div>
          )}

          {!isProtected && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >×</button>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: `${typeConfig.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              {typeConfig.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>{node.title}</div>
              <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>
                {isEntryCriteria ? getFilterSummary() : node.subtitle}
              </div>
            </div>
          </div>

          {isEntryCriteria && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilterPanel(true); }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '8px',
                  color: t.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>🎯</span> Edit Criteria
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPreviewModal(true); }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: t.primary + '15',
                  border: `1px solid ${t.primary}40`,
                  borderRadius: '8px',
                  color: t.primary,
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>👥</span> Preview {hasFilters && enrolleeCount !== undefined && !loadingCount && (
                  <span style={{
                    backgroundColor: t.primary,
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: '600'
                  }}>
                    {enrolleeCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Connector */}
        {!node.branches && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />
            <button
              onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: null })}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >+</button>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />

            {showAddMenu?.afterNodeId === node.id && !showAddMenu?.branch && (
              <AddNodeMenu onSelect={(type) => addNode(node.id, type)} onClose={() => setShowAddMenu(null)} />
            )}
          </div>
        )}

        {/* Branches */}
        {node.branches && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />
            <div style={{ display: 'flex' }}>
              {/* Yes */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '340px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '60px', height: '2px', backgroundColor: t.success }} />
                  <span style={{ padding: '4px 10px', backgroundColor: '#22c55e20', borderRadius: '12px', fontSize: '10px', fontWeight: '600', color: t.success }}>YES</span>
                </div>
                <div style={{ width: '2px', height: '20px', backgroundColor: t.success }} />
                {node.branches.yes.map(n => <WorkflowNode key={n.id} node={n} />)}
                <button
                  onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: 'yes' })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: t.bgHover,
                    border: '1px dashed #22c55e',
                    color: t.success,
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '10px'
                  }}
                >+</button>
                {showAddMenu?.afterNodeId === node.id && showAddMenu?.branch === 'yes' && (
                  <AddNodeMenu onSelect={(type) => addNode(node.id, type, 'yes')} onClose={() => setShowAddMenu(null)} />
                )}
              </div>
              {/* No */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '340px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ padding: '4px 10px', backgroundColor: '#ef444420', borderRadius: '12px', fontSize: '10px', fontWeight: '600', color: t.danger }}>NO</span>
                  <div style={{ width: '60px', height: '2px', backgroundColor: t.danger }} />
                </div>
                <div style={{ width: '2px', height: '20px', backgroundColor: t.danger }} />
                {node.branches.no.map(n => <WorkflowNode key={n.id} node={n} />)}
                <button
                  onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: 'no' })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: t.bgHover,
                    border: '1px dashed #ef4444',
                    color: t.danger,
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '10px'
                  }}
                >+</button>
                {showAddMenu?.afterNodeId === node.id && showAddMenu?.branch === 'no' && (
                  <AddNodeMenu onSelect={(type) => addNode(node.id, type, 'no')} onClose={() => setShowAddMenu(null)} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const AddNodeMenu = ({ onSelect, onClose }) => (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: '10px',
        backgroundColor: t.bgCard,
        border: `1px solid ${t.borderLight}`,
        borderRadius: '12px',
        padding: '8px',
        zIndex: 100,
        width: '240px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
      }}>
        {availableNodes.map(node => (
          <button
            key={node.type}
            onClick={() => onSelect(node.type)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: t.text,
              textAlign: 'left'
            }}
          >
            <span style={{ fontSize: '18px' }}>{node.icon}</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>{node.label}</div>
              <div style={{ fontSize: '11px', color: t.textMuted }}>{node.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );

  const selectedNodeData = nodes.find(n => n.id === selectedNode) ||
    nodes.flatMap(n => n.branches ? [...(n.branches.yes || []), ...(n.branches.no || [])] : []).find(n => n.id === selectedNode);

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      backgroundColor: t.bg,
      height: '100%',
      color: t.text,
      display: 'flex'
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left - Nodes */}
        <div style={{ width: '220px', borderRight: `1px solid ${t.border}`, padding: '16px', backgroundColor: t.bgCard, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: t.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>Add Nodes</div>
          {availableNodes.map(node => (
            <div key={node.type} style={{
              padding: '12px',
              backgroundColor: t.bgHover,
              borderRadius: '8px',
              marginBottom: '8px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '18px' }}>{node.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>{node.label}</div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>{node.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Center - Canvas */}
        <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {nodes.map(node => <WorkflowNode key={node.id} node={node} />)}
            <div style={{ marginTop: '16px', padding: '8px 18px', backgroundColor: t.bgHover, borderRadius: '20px', fontSize: '12px', color: t.textMuted }}>
              End of automation
            </div>
          </div>
        </div>

        {/* Right - Config */}
        <div style={{ width: '300px', borderLeft: `1px solid ${t.border}`, backgroundColor: t.bgCard, overflowY: 'auto' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>
            Configuration
          </div>
          <div style={{ padding: '18px' }}>
            {selectedNodeData ? (
              <div>
                {/* Node header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: `${nodeTypes[selectedNodeData.type]?.color || t.primary}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {nodeTypes[selectedNodeData.type]?.icon || '📧'}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', color: t.text, fontSize: '15px' }}>{selectedNodeData.title}</div>
                    <div style={{ fontSize: '12px', color: t.textMuted }}>{nodeTypes[selectedNodeData.type]?.label || 'Node'}</div>
                  </div>
                </div>

                {/* Node-specific config */}
                {selectedNodeData.type === 'entry_criteria' && (
                  <div>
                    <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '16px' }}>
                      Define which accounts enter this automation based on their attributes.
                    </p>

                    {/* Show filter summary */}
                    {(filterConfig?.groups || []).length > 0 && (
                      <div style={{
                        padding: '12px',
                        backgroundColor: t.bgHover,
                        borderRadius: '8px',
                        marginBottom: '16px'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: t.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>
                          Current Filters
                        </div>
                        {filterConfig.groups.map((group, gIdx) => (
                          <div key={gIdx} style={{ marginBottom: gIdx < filterConfig.groups.length - 1 ? '8px' : 0 }}>
                            {gIdx > 0 && (
                              <div style={{
                                fontSize: '10px',
                                color: '#f59e0b',
                                fontWeight: '700',
                                textAlign: 'center',
                                margin: '6px 0'
                              }}>
                                OR
                              </div>
                            )}
                            {(group.rules || []).filter(r => r.field && r.operator).map((rule, rIdx) => (
                              <div key={rIdx} style={{
                                padding: '4px 8px',
                                backgroundColor: `${t.primary}15`,
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: t.text,
                                marginBottom: '4px'
                              }}>
                                {formatRuleText(rule)}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => setShowFilterPanel(true)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: t.primary,
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        marginBottom: '20px'
                      }}
                    >
                      Edit Entry Criteria
                    </button>

                    {/* Re-entry Settings */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: t.bgHover,
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: t.text, marginBottom: '12px' }}>
                        Re-entry Rules
                      </div>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        marginBottom: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={reentryConfig.enabled}
                          onChange={(e) => updateReentryConfig({ ...reentryConfig, enabled: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: t.primary }}
                        />
                        <span style={{ fontSize: '13px', color: t.textSecondary }}>
                          Allow contacts to re-enter
                        </span>
                      </label>

                      {reentryConfig.enabled && (
                        <div style={{ marginLeft: '26px' }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '8px',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="radio"
                              name="reentryType"
                              checked={reentryConfig.type === 'after_days'}
                              onChange={() => updateReentryConfig({ ...reentryConfig, type: 'after_days' })}
                              style={{ accentColor: t.primary }}
                            />
                            <span style={{ fontSize: '12px', color: t.textSecondary }}>After</span>
                            <input
                              type="number"
                              value={reentryConfig.days}
                              onChange={(e) => updateReentryConfig({ ...reentryConfig, days: parseInt(e.target.value) || 1 })}
                              min="1"
                              style={{
                                width: '60px',
                                padding: '4px 8px',
                                backgroundColor: t.bgInput,
                                border: `1px solid ${t.border}`,
                                borderRadius: '4px',
                                color: t.text,
                                fontSize: '12px'
                              }}
                            />
                            <span style={{ fontSize: '12px', color: t.textSecondary }}>days</span>
                          </label>
                        </div>
                      )}

                      {!reentryConfig.enabled && (
                        <p style={{ fontSize: '11px', color: t.textMuted, margin: 0 }}>
                          Contacts can only enter this automation once
                        </p>
                      )}
                    </div>

                    {/* Enrollment Pacing Settings */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: t.bgHover,
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: t.text, marginBottom: '12px' }}>
                        Enrollment Pacing
                      </div>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        marginBottom: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={pacingConfig.enabled}
                          onChange={(e) => updatePacingConfig({ ...pacingConfig, enabled: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: t.primary }}
                        />
                        <span style={{ fontSize: '13px', color: t.textSecondary }}>
                          Spread enrollments over time
                        </span>
                      </label>

                      {pacingConfig.enabled && (
                        <div style={{ marginLeft: '26px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '12px', color: t.textSecondary }}>Spread over</span>
                            <input
                              type="number"
                              value={pacingConfig.spreadOverDays}
                              onChange={(e) => updatePacingConfig({ ...pacingConfig, spreadOverDays: parseInt(e.target.value) || 1 })}
                              min="1"
                              max="365"
                              style={{
                                width: '60px',
                                padding: '4px 8px',
                                backgroundColor: t.bgInput,
                                border: `1px solid ${t.border}`,
                                borderRadius: '4px',
                                color: t.text,
                                fontSize: '12px'
                              }}
                            />
                            <span style={{ fontSize: '12px', color: t.textSecondary }}>days</span>
                          </div>

                          <div style={{ fontSize: '11px', color: t.textSecondary, marginBottom: '8px' }}>
                            Run on these days:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {[
                              { value: 'sun', label: 'Sun' },
                              { value: 'mon', label: 'Mon' },
                              { value: 'tue', label: 'Tue' },
                              { value: 'wed', label: 'Wed' },
                              { value: 'thu', label: 'Thu' },
                              { value: 'fri', label: 'Fri' },
                              { value: 'sat', label: 'Sat' }
                            ].map(day => (
                              <button
                                key={day.value}
                                onClick={() => {
                                  const currentDays = pacingConfig.allowedDays || [];
                                  const newDays = currentDays.includes(day.value)
                                    ? currentDays.filter(d => d !== day.value)
                                    : [...currentDays, day.value];
                                  updatePacingConfig({ ...pacingConfig, allowedDays: newDays });
                                }}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: (pacingConfig.allowedDays || []).includes(day.value) ? t.primary : t.bgCard,
                                  color: (pacingConfig.allowedDays || []).includes(day.value) ? '#fff' : t.textSecondary,
                                  border: `1px solid ${(pacingConfig.allowedDays || []).includes(day.value) ? t.primary : t.border}`,
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!pacingConfig.enabled && (
                        <p style={{ fontSize: '11px', color: t.textMuted, margin: 0 }}>
                          All matching contacts will be enrolled immediately
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {selectedNodeData.type === 'trigger' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Run Time</label>
                    <input
                      type="time"
                      value={selectedNodeData.config?.time || '09:00'}
                      onChange={(e) => {
                        const newTime = e.target.value;
                        const frequency = selectedNodeData.config?.frequency || 'Daily';
                        const timezone = selectedNodeData.config?.timezone || 'America/Chicago';
                        updateNode(selectedNode, {
                          config: {
                            ...selectedNodeData.config,
                            time: newTime
                          },
                          subtitle: `${frequency} at ${newTime} (${timezone.split('/')[1] || timezone})`
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: t.bgHover,
                        border: `1px solid ${t.border}`,
                        borderRadius: '8px',
                        color: t.text,
                        fontSize: '14px',
                        marginBottom: '16px'
                      }}
                    />
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Frequency</label>
                    <select
                      value={selectedNodeData.config?.frequency || 'Daily'}
                      onChange={(e) => {
                        const newFrequency = e.target.value;
                        const time = selectedNodeData.config?.time || '09:00';
                        const timezone = selectedNodeData.config?.timezone || 'America/Chicago';
                        updateNode(selectedNode, {
                          config: {
                            ...selectedNodeData.config,
                            frequency: newFrequency
                          },
                          subtitle: `${newFrequency} at ${time} (${timezone.split('/')[1] || timezone})`
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: t.bgHover,
                        border: `1px solid ${t.border}`,
                        borderRadius: '8px',
                        color: t.text,
                        fontSize: '14px'
                      }}
                    >
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                )}

                {selectedNodeData.type === 'send_email' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Email Template</label>
                    {isMasterEdit && (
                      <p style={{ fontSize: '11px', color: t.warning, marginBottom: '8px', margin: '0 0 8px 0' }}>
                        Only master templates are shown for master automations
                      </p>
                    )}
                    <select
                      value={(() => {
                        if (isMasterEdit) {
                          // For master edit, use templateKey directly
                          return selectedNodeData.config?.templateKey || '';
                        }
                        // For user automations:
                        // First check if there's a direct template ID match
                        if (selectedNodeData.config?.template) {
                          return selectedNodeData.config.template;
                        }
                        // If the node was synced from master, it has templateKey instead
                        // Find the user's template with matching default_key
                        if (selectedNodeData.config?.templateKey) {
                          const matchingTemplate = templates.find(t => t.default_key === selectedNodeData.config.templateKey);
                          return matchingTemplate?.id || '';
                        }
                        return '';
                      })()}
                      onChange={(e) => {
                        const templateValue = e.target.value;
                        // For master edit, find by default_key; otherwise by id
                        const selectedTemplate = isMasterEdit
                          ? templates.find(t => t.default_key === templateValue)
                          : templates.find(t => t.id === templateValue);

                        updateNode(selectedNode, {
                          config: {
                            ...selectedNodeData.config,
                            // Store templateKey for master automations, template (id) for regular
                            ...(isMasterEdit
                              ? { templateKey: templateValue, templateName: selectedTemplate?.name || '' }
                              : { template: templateValue, templateName: selectedTemplate?.name || '' }
                            )
                          },
                          subtitle: selectedTemplate?.name || 'Select template...'
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: t.bgHover,
                        border: `1px solid ${t.border}`,
                        borderRadius: '8px',
                        color: t.text,
                        fontSize: '14px'
                      }}
                    >
                      <option value="">
                        {templatesLoading ? 'Loading templates...' : 'Select template...'}
                      </option>
                      {templates.map(template => (
                        <option
                          key={isMasterEdit ? template.default_key : template.id}
                          value={isMasterEdit ? template.default_key : template.id}
                        >
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedNodeData.type === 'delay' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Wait Duration</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        value={selectedNodeData.config?.duration || 1}
                        min="1"
                        onChange={(e) => {
                          const newDuration = parseInt(e.target.value, 10) || 1;
                          const unit = selectedNodeData.config?.unit || 'days';
                          updateNode(selectedNode, {
                            config: {
                              ...selectedNodeData.config,
                              duration: newDuration
                            },
                            subtitle: `Wait ${newDuration} ${unit}`
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
                          color: t.text,
                          fontSize: '14px'
                        }}
                      />
                      <select
                        value={selectedNodeData.config?.unit || 'days'}
                        onChange={(e) => {
                          const newUnit = e.target.value;
                          const duration = selectedNodeData.config?.duration || 1;
                          updateNode(selectedNode, {
                            config: {
                              ...selectedNodeData.config,
                              unit: newUnit
                            },
                            subtitle: `Wait ${duration} ${newUnit}`
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
                          color: t.text,
                          fontSize: '14px'
                        }}
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                      </select>
                    </div>
                  </div>
                )}

                {(selectedNodeData.type === 'condition' || selectedNodeData.type === 'field_condition') && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Condition Type</label>
                    <select
                      value={selectedNodeData.config?.type || 'email_opened'}
                      onChange={(e) => {
                        const newType = e.target.value;
                        const conditionLabels = {
                          email_opened: 'If email opened',
                          email_clicked: 'If email clicked',
                          field_value: 'If field matches'
                        };
                        updateNode(selectedNode, {
                          config: {
                            ...selectedNodeData.config,
                            type: newType
                          },
                          subtitle: conditionLabels[newType] || 'Configure condition...'
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: t.bgHover,
                        border: `1px solid ${t.border}`,
                        borderRadius: '8px',
                        color: t.text,
                        fontSize: '14px'
                      }}
                    >
                      <option value="email_opened">Email Opened</option>
                      <option value="email_clicked">Email Clicked</option>
                      <option value="field_value">Field Value</option>
                    </select>
                  </div>
                )}

                {selectedNodeData.type === 'end' && (
                  <p style={{ fontSize: '13px', color: t.textSecondary }}>
                    This node ends the automation flow. Contacts reaching this point will exit the automation.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: t.textMuted, padding: '30px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>👆</div>
                <div style={{ fontSize: '13px' }}>Select a node to configure</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Panel Modal - Now using shared FilterBuilder */}
      {showFilterPanel && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 }} onClick={() => setShowFilterPanel(false)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '900px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            backgroundColor: t.bgCard,
            borderRadius: '16px',
            border: `1px solid ${t.border}`,
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>Entry Criteria</h2>
              <button onClick={() => setShowFilterPanel(false)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
              <FilterBuilder
                filterConfig={filterConfig}
                setFilterConfig={updateFilterConfig}
                showQuickFilters={true}
                theme={t}
              />
            </div>
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              flexShrink: 0
            }}>
              {canEdit ? (
                <>
                  <button onClick={() => setShowFilterPanel(false)} style={{
                    padding: '10px 20px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.borderLight}`,
                    borderRadius: '8px',
                    color: t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}>Cancel</button>
                  <button onClick={() => setShowFilterPanel(false)} style={{
                    padding: '10px 20px',
                    backgroundColor: t.primary,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}>Save Criteria</button>
                </>
              ) : (
                <button onClick={() => setShowFilterPanel(false)} style={{
                  padding: '10px 20px',
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '8px',
                  color: t.textSecondary,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}>Close</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Preview Potential Enrollees Modal */}
      {showPreviewModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 }} onClick={() => setShowPreviewModal(false)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '800px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            backgroundColor: t.bgCard,
            borderRadius: '16px',
            border: `1px solid ${t.border}`,
            zIndex: 201,
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
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>Preview Potential Enrollees</h2>
                <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
                  {isMasterEdit
                    ? 'Testing filters against ALL accounts in the system (admin view)'
                    : 'Contacts matching your entry criteria who would enter this automation'}
                </p>
                {isMasterEdit && (
                  <span style={{
                    display: 'inline-block',
                    marginTop: '6px',
                    padding: '4px 8px',
                    backgroundColor: `${t.warning}20`,
                    color: t.warning,
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    Admin Test Mode - Showing All Accounts
                  </span>
                )}
              </div>
              <button onClick={() => setShowPreviewModal(false)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            {/* Stats Summary */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              gap: '24px',
              backgroundColor: t.bgHover
            }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.primary }}>
                  {loadingEnrollees ? '...' : (potentialEnrollees?.length || 0)}
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Matching Contacts</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.success }}>
                  {filterConfig?.groups?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Filter Groups</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.textSecondary }}>
                  {filterConfig?.groups?.reduce((sum, g) => sum + (g.rules?.filter(r => r.field && r.operator).length || 0), 0) || 0}
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Active Filters</div>
              </div>
              {pacingConfig.enabled && (
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: t.warning }}>
                    ~{Math.ceil((potentialEnrollees?.length || 0) / (getPacedScheduleDates(potentialEnrollees?.length || 0).length || 1))}/day
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>
                    Over {pacingConfig.spreadOverDays} days ({pacingConfig.allowedDays?.length || 5} days/wk)
                  </div>
                </div>
              )}
            </div>


            {/* Potential Enrollees Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              {loadingEnrollees ? (
                <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
                  <div style={{ fontSize: '14px' }}>Loading potential enrollees...</div>
                </div>
              ) : !hasFilters ? (
                <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎯</div>
                  <div style={{ fontSize: '14px' }}>Add filters to see who would enter this automation</div>
                </div>
              ) : potentialEnrollees && potentialEnrollees.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: t.bgHover }}>
                      <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Contact</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Account Type</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Last Email</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Matched Groups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {potentialEnrollees.map((contact) => (
                      <tr key={contact.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>{contact.name || contact.account_name}</div>
                          <div style={{ fontSize: '12px', color: t.textMuted }}>{contact.email}</div>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '13px', color: t.textSecondary }}>
                          {contact.account_type || '—'}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '13px', color: t.textSecondary }}>
                          {contact._lastEmailSent ? new Date(contact._lastEmailSent).toLocaleDateString() : 'Never'}
                        </td>
                        <td style={{ padding: '12px 20px', position: 'relative' }}>
                          {contact._matchedGroups && contact._matchedGroups.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {contact._matchedGroups.map((groupIndex) => (
                                <span
                                  key={groupIndex}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    backgroundColor: hoveredGroupTooltip?.contactId === contact.id && hoveredGroupTooltip?.groupIndex === groupIndex
                                      ? t.primary
                                      : `${t.primary}20`,
                                    color: hoveredGroupTooltip?.contactId === contact.id && hoveredGroupTooltip?.groupIndex === groupIndex
                                      ? '#fff'
                                      : t.primary,
                                    cursor: 'default',
                                    transition: 'all 0.15s ease',
                                    position: 'relative'
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = e.target.getBoundingClientRect();
                                    setHoveredGroupTooltip({
                                      contactId: contact.id,
                                      groupIndex,
                                      x: rect.left,
                                      y: rect.bottom + 8
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredGroupTooltip(null);
                                  }}
                                >
                                  Group {groupIndex + 1}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: t.textMuted }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>👥</div>
                  <div style={{ fontSize: '14px' }}>No contacts match your current filters</div>
                </div>
              )}

              {/* Group filter tooltip */}
              {hoveredGroupTooltip && filterConfig?.groups?.[hoveredGroupTooltip.groupIndex] && (
                <div
                  style={{
                    position: 'fixed',
                    left: hoveredGroupTooltip.x,
                    top: hoveredGroupTooltip.y,
                    backgroundColor: t.bgCard,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 10000,
                    maxWidth: '300px',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: '600', color: t.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>
                    Group {hoveredGroupTooltip.groupIndex + 1} Criteria
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {filterConfig.groups[hoveredGroupTooltip.groupIndex].rules
                      ?.filter(r => r.field && r.operator)
                      .map((rule, idx) => (
                        <div key={idx} style={{ fontSize: '12px', color: t.text }}>
                          {formatRuleText(rule)}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
              backgroundColor: t.bgHover
            }}>
              <span style={{ fontSize: '12px', color: t.textMuted }}>
                {loadingEnrollees ? 'Loading...' : `Showing ${potentialEnrollees?.length || 0} potential enrollee${(potentialEnrollees?.length || 0) !== 1 ? 's' : ''}`}
              </span>
              <button onClick={() => setShowPreviewModal(false)} style={{
                padding: '8px 16px',
                backgroundColor: t.bgCard,
                border: `1px solid ${t.borderLight}`,
                borderRadius: '6px',
                color: t.textSecondary,
                cursor: 'pointer',
                fontSize: '12px'
              }}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkflowBuilder;
