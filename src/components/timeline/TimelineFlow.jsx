// src/components/timeline/TimelineFlow.jsx
import React from 'react';

/**
 * Mini workflow visualization for the timeline cards
 * Simplified version of WorkflowBuilder for read-only display
 */
const TimelineFlow = ({ nodes, templateMap, t, onTemplateClick }) => {
  // Node type configurations
  const nodeTypes = {
    entry_criteria: { icon: '🎯', color: '#8b5cf6', label: 'Entry' },
    trigger: { icon: '⚡', color: '#3b82f6', label: 'Trigger' },
    send_email: { icon: '📧', color: '#22c55e', label: 'Email' },
    delay: { icon: '⏱', color: '#f59e0b', label: 'Wait' },
    condition: { icon: '🔀', color: '#a78bfa', label: 'If/Then' },
    field_condition: { icon: '📋', color: '#ec4899', label: 'Check' },
    update_field: { icon: '✏️', color: '#06b6d4', label: 'Update' },
    end: { icon: '🏁', color: '#71717a', label: 'End' }
  };

  // Filter out entry_criteria for the flow display (shown separately)
  const flowNodes = nodes.filter(n => n.type !== 'entry_criteria');

  if (flowNodes.length === 0) {
    return (
      <div style={{
        padding: '16px',
        textAlign: 'center',
        color: t.textMuted,
        fontSize: '13px'
      }}>
        No workflow steps defined
      </div>
    );
  }

  // Get node display info
  const getNodeInfo = (node) => {
    const type = nodeTypes[node.type] || { icon: '?', color: '#71717a', label: node.type };

    let subtitle = '';
    if (node.type === 'send_email') {
      const templateKey = node.config?.templateKey || node.config?.template;
      const template = templateKey && templateMap?.[templateKey];
      subtitle = template?.name || templateKey || 'No template';
    } else if (node.type === 'delay') {
      const days = node.config?.days || 0;
      const hours = node.config?.hours || 0;
      if (days > 0) {
        subtitle = `${days} day${days > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        subtitle = `${hours} hour${hours > 1 ? 's' : ''}`;
      } else {
        subtitle = 'No delay';
      }
    } else if (node.type === 'condition') {
      subtitle = node.config?.type === 'email_opened' ? 'Opened?' : 'Clicked?';
    } else if (node.type === 'trigger') {
      const time = node.config?.time || '09:00';
      subtitle = `Daily at ${time}`;
    }

    return { ...type, subtitle };
  };

  // Render a single node
  const renderNode = (node, index, isLast, isBranch = false) => {
    const info = getNodeInfo(node);
    const isEmail = node.type === 'send_email';
    const templateKey = isEmail ? (node.config?.templateKey || node.config?.template) : null;

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Node */}
        <div
          onClick={() => isEmail && templateKey && onTemplateClick?.(templateKey)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: `${info.color}15`,
            border: `1px solid ${info.color}40`,
            borderRadius: '8px',
            cursor: isEmail && templateKey ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            minWidth: isBranch ? '100px' : '120px'
          }}
        >
          <span style={{ fontSize: '14px' }}>{info.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: info.color,
              textTransform: 'uppercase'
            }}>
              {info.label}
            </div>
            {info.subtitle && (
              <div style={{
                fontSize: '11px',
                color: t.textSecondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100px'
              }}>
                {info.subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Connector */}
        {!isLast && (
          <div style={{
            width: '2px',
            height: '16px',
            backgroundColor: t.border,
            margin: '4px 0'
          }} />
        )}

        {/* Branches for conditions */}
        {node.branches && renderBranches(node.branches)}
      </div>
    );
  };

  // Render branches for condition nodes
  const renderBranches = (branches) => {
    const yesNodes = branches.yes || [];
    const noNodes = branches.no || [];

    if (yesNodes.length === 0 && noNodes.length === 0) return null;

    return (
      <div style={{
        display: 'flex',
        gap: '16px',
        marginTop: '4px',
        position: 'relative'
      }}>
        {/* Yes branch */}
        {yesNodes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              fontSize: '10px',
              color: '#22c55e',
              fontWeight: '600',
              marginBottom: '4px'
            }}>
              YES
            </div>
            {yesNodes.map((node, idx) => renderNode(node, idx, idx === yesNodes.length - 1, true))}
          </div>
        )}

        {/* No branch */}
        {noNodes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              fontSize: '10px',
              color: '#ef4444',
              fontWeight: '600',
              marginBottom: '4px'
            }}>
              NO
            </div>
            {noNodes.map((node, idx) => renderNode(node, idx, idx === noNodes.length - 1, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px',
      backgroundColor: t.bgHover,
      borderRadius: '8px'
    }}>
      {flowNodes.map((node, index) => renderNode(node, index, index === flowNodes.length - 1))}
    </div>
  );
};

export default TimelineFlow;
