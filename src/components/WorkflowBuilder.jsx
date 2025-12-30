import React, { useState } from 'react';
import FilterBuilder, { formatRuleText } from './FilterBuilder';

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

const WorkflowBuilder = ({ t: themeProp, automation, onUpdate, onSave }) => {
  // Use provided theme or default
  const t = themeProp || defaultTheme;

  // Use automation nodes if they exist and have items, otherwise use defaults
  const initialNodes = (automation?.nodes && automation.nodes.length > 0)
    ? automation.nodes
    : defaultNodes;

  const [nodes, setNodes] = useState(initialNodes);

  const [selectedNode, setSelectedNode] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Get enrollees and stats from automation data
  const enrollees = automation?.enrollees || [];
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

  // Get filter summary for display
  const getFilterSummary = () => {
    const groups = filterConfig?.groups || [];
    const totalFilters = groups.reduce((sum, g) => sum + (g.rules?.filter(r => r.field && r.operator).length || 0), 0);
    if (totalFilters === 0) return 'No filters defined';
    return `${totalFilters} filter${totalFilters !== 1 ? 's' : ''} in ${groups.length} group${groups.length !== 1 ? 's' : ''}`;
  };

  // Helper to format node stats
  const getNodeStatsDisplay = (nodeId, nodeType) => {
    const stats = nodeStats[nodeId] || node?.stats || {};
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
            if (isEntryCriteria) {
              setShowFilterPanel(true);
            }
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
                <span>👥</span> Preview
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
                      defaultValue={selectedNodeData.config?.time || '09:00'}
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
                      defaultValue={selectedNodeData.config?.frequency || 'Daily'}
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
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Monthly</option>
                    </select>
                  </div>
                )}

                {selectedNodeData.type === 'send_email' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Email Template</label>
                    <select
                      defaultValue={selectedNodeData.config?.template || ''}
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
                      <option value="">Select template...</option>
                      <option>Welcome Email</option>
                      <option>Cross-Sell Introduction</option>
                      <option>Renewal Reminder</option>
                      <option>Follow-Up</option>
                      <option>Re-engagement</option>
                    </select>
                  </div>
                )}

                {selectedNodeData.type === 'delay' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>Wait Duration</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        defaultValue={selectedNodeData.config?.duration || 1}
                        min="1"
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
                        defaultValue={selectedNodeData.config?.unit || 'days'}
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
                      defaultValue={selectedNodeData.config?.type || 'email_opened'}
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
            </div>
          </div>
        </>
      )}

      {/* Preview Enrollees Modal */}
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
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>Preview Enrollees</h2>
                <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
                  Contacts matching your entry criteria (last 30 days)
                </p>
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
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.primary }}>{enrollees.length}</div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Total Enrolled</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.success }}>{enrollees.filter(e => e.status === 'active').length}</div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Currently Active</div>
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: t.textSecondary }}>{enrollees.filter(e => e.status === 'completed').length}</div>
                <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase' }}>Completed</div>
              </div>
            </div>

            {/* Enrollees Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: t.bgHover }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Contact</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Entry Date</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Current Step</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollees.map((enrollee) => (
                    <tr key={enrollee.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>{enrollee.name || enrollee.account_name}</div>
                        <div style={{ fontSize: '12px', color: t.textMuted }}>{enrollee.email}</div>
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: '13px', color: t.textSecondary }}>
                        {enrollee.entry_date ? new Date(enrollee.entry_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: '13px', color: t.textSecondary }}>
                        {enrollee.current_step || '—'}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: enrollee.status === 'active' ? `${t.success}20` : `${t.textMuted}20`,
                          color: enrollee.status === 'active' ? t.success : t.textMuted
                        }}>
                          {enrollee.status === 'active' ? 'Active' : 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {enrollees.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>👥</div>
                  <div style={{ fontSize: '14px' }}>No enrollees yet</div>
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
                Showing {enrollees.length} contact{enrollees.length !== 1 ? 's' : ''}
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
