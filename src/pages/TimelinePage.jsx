// src/pages/TimelinePage.jsx
import React, { useState, useMemo } from 'react';
import { useLifecycleStages } from '../hooks/useTimeline';

// Loading skeleton component
const Skeleton = ({ width = '100%', height = '20px', style = {} }) => (
  <div
    style={{
      width,
      height,
      backgroundColor: 'currentColor',
      opacity: 0.1,
      borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite',
      ...style
    }}
  />
);

// Clean, professional color palette
const colors = {
  prospect: { bg: '#6366f1', border: '#6366f1', text: '#fff' },
  welcome: { bg: '#10b981', border: '#10b981', text: '#fff' },
  crossSale: { bg: '#ec4899', border: '#ec4899', text: '#fff' },
  renewal: { bg: '#3b82f6', border: '#3b82f6', text: '#fff' },
  renewed: { bg: '#10b981', border: '#10b981', text: '#fff' },
  prior: { bg: '#f59e0b', border: '#f59e0b', text: '#fff' },
  periodic: { bg: '#8b5cf6', border: '#8b5cf6', text: '#fff' },
  decision: { bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },
  cancelled: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  default: { bg: '#64748b', border: '#64748b', text: '#fff' }
};

const TimelinePage = ({ t }) => {
  const [lobFilter, setLobFilter] = useState('Personal');
  const [selectedNode, setSelectedNode] = useState(null);

  const { data, isLoading, error } = useLifecycleStages();

  const flowchartData = useMemo(() => {
    if (!data?.stages) return null;
    const allAutomations = data.stages.flatMap(stage =>
      stage.automations.filter(a =>
        lobFilter === 'all' || a.lineOfBusiness === lobFilter || a.lineOfBusiness === 'All'
      )
    );
    return buildFlowchartStructure(allAutomations, lobFilter);
  }, [data?.stages, lobFilter]);

  if (isLoading) {
    return (
      <div>
        <div style={{ marginBottom: '24px' }}>
          <Skeleton width="300px" height="32px" style={{ marginBottom: '8px' }} />
          <Skeleton width="400px" height="16px" />
        </div>
        <Skeleton height="600px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        background: t.cardBg,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h3 style={{ color: t.text, marginBottom: '8px' }}>Failed to load timeline</h3>
        <p style={{ color: t.textSecondary }}>{error.message}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: t.text,
          marginBottom: '4px'
        }}>
          Customer Lifecycle Timeline
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px' }}>
          Visualize the customer journey through your automation workflows
        </p>
      </div>

      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        padding: '16px 20px',
        background: t.cardBg,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        alignItems: 'center'
      }}>
        {/* Line of Business Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: t.textSecondary, fontWeight: '500' }}>Line of Business:</span>
          <div style={{
            display: 'flex',
            background: t.inputBg || 'rgba(0,0,0,0.05)',
            borderRadius: '8px',
            padding: '3px'
          }}>
            {['Personal', 'Commercial'].map(lob => (
              <button
                key={lob}
                onClick={() => setLobFilter(lob)}
                style={{
                  padding: '8px 16px',
                  background: lobFilter === lob ? '#6366f1' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: lobFilter === lob ? '#fff' : t.textSecondary,
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {lob}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '16px',
              height: '16px',
              background: '#3b82f6',
              borderRadius: '4px'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Automation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '16px',
              height: '16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              transform: 'rotate(45deg)'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Decision</span>
          </div>
        </div>
      </div>

      {/* Flowchart Canvas */}
      <div style={{
        background: t.cardBg,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        padding: '40px',
        minHeight: '600px',
        overflow: 'auto',
        position: 'relative'
      }}>
        <FlowchartCanvas
          flowchartData={flowchartData}
          templateMap={data?.templateMap}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          t={t}
        />
      </div>

      {/* Node Details Panel */}
      {selectedNode?.automation && (
        <NodeDetailsPanel
          node={selectedNode}
          templateMap={data?.templateMap}
          onClose={() => setSelectedNode(null)}
          t={t}
        />
      )}
    </div>
  );
};

// ============================================
// BUILD FLOWCHART STRUCTURE
// ============================================
function buildFlowchartStructure(automations, lobFilter) {
  const findAutomation = (namePattern) => {
    return automations.find(a =>
      a.name?.toLowerCase().includes(namePattern.toLowerCase()) ||
      a.default_key?.toLowerCase().includes(namePattern.toLowerCase())
    );
  };

  const nodes = [];
  const connections = [];

  // === TOP LEFT: Prospect ===
  nodes.push({
    id: 'prospect',
    type: 'automation',
    label: 'Prospect',
    automation: findAutomation('prospect'),
    colorScheme: 'prospect',
    col: 0, row: 0
  });

  nodes.push({
    id: 'prospect-email',
    type: 'automation',
    label: 'Prospect\nEmail - 6',
    automation: findAutomation('prospect') || findAutomation('quoted'),
    colorScheme: 'prospect',
    col: 3, row: 0
  });
  connections.push({ from: 'prospect', to: 'prospect-email', label: 'Not sold' });

  // === Welcome ===
  nodes.push({
    id: 'welcome',
    type: 'automation',
    label: 'Welcome',
    automation: findAutomation('welcome'),
    colorScheme: 'welcome',
    col: 0, row: 1.5
  });
  connections.push({ from: 'prospect', to: 'welcome', label: 'Sold', direction: 'down' });

  // === Is Cross Sale Decision ===
  nodes.push({
    id: 'is-cross-sale',
    type: 'decision',
    label: 'Is Cross\nSale',
    colorScheme: 'decision',
    col: 2, row: 2
  });

  // Midterm Crossale
  nodes.push({
    id: 'midterm-crossale',
    type: 'automation',
    label: 'Midterm\nCrossale',
    automation: findAutomation('midterm') || findAutomation('cross-sell'),
    colorScheme: 'crossSale',
    col: 3, row: 1.5
  });
  connections.push({ from: 'is-cross-sale', to: 'midterm-crossale', label: 'Yes' });

  // No Feedback
  nodes.push({
    id: 'no-feedback',
    type: 'decision',
    label: 'No\nFeedback',
    colorScheme: 'decision',
    col: 2, row: 3.5
  });
  connections.push({ from: 'is-cross-sale', to: 'no-feedback', direction: 'down' });

  // Periodic Feedback
  nodes.push({
    id: 'periodic-feedback',
    type: 'automation',
    label: 'Periodic\nFeedback',
    automation: findAutomation('periodic') || findAutomation('feedback'),
    colorScheme: 'periodic',
    col: 3.5, row: 3.5
  });
  connections.push({ from: 'no-feedback', to: 'periodic-feedback' });

  // === Renewal Email ===
  nodes.push({
    id: 'renewal-email',
    type: 'automation',
    label: 'Renewal\nEmail',
    automation: findAutomation('renewal'),
    colorScheme: 'renewal',
    col: 5, row: 2
  });
  connections.push({ from: 'midterm-crossale', to: 'renewal-email', curve: 'down' });
  connections.push({ from: 'periodic-feedback', to: 'renewal-email', curve: 'up' });

  // === Renewed Decision ===
  nodes.push({
    id: 'renewed',
    type: 'decision',
    label: 'Renewed',
    colorScheme: 'decision',
    col: 6.5, row: 2
  });
  connections.push({ from: 'renewal-email', to: 'renewed' });

  // Renewed Email
  nodes.push({
    id: 'renewed-email',
    type: 'automation',
    label: 'Renewed\nEmail',
    automation: findAutomation('renewed') || findAutomation('thank'),
    colorScheme: 'renewed',
    col: 8, row: 1.5
  });
  connections.push({ from: 'renewed', to: 'renewed-email', label: 'Yes' });

  // Prior Customer (top)
  nodes.push({
    id: 'prior-customer-top',
    type: 'automation',
    label: 'Prior\nCustomer',
    automation: findAutomation('prior'),
    colorScheme: 'prior',
    col: 8, row: 3
  });
  connections.push({ from: 'renewed', to: 'prior-customer-top', label: 'No', direction: 'down' });

  // === Is Cancelled Path ===
  nodes.push({
    id: 'is-cancelled',
    type: 'decision',
    label: 'Is\nCancelled',
    colorScheme: 'cancelled',
    col: 0, row: 4.5
  });

  nodes.push({
    id: 'is-cross-sale-cancelled',
    type: 'decision',
    label: 'Is Cross\nSale',
    colorScheme: 'decision',
    col: 2, row: 4.5
  });
  connections.push({ from: 'is-cancelled', to: 'is-cross-sale-cancelled' });

  nodes.push({
    id: 'cross-sale',
    type: 'automation',
    label: 'Cross Sale',
    automation: findAutomation('cross') || findAutomation('midterm'),
    colorScheme: 'crossSale',
    col: 3.5, row: 4.5
  });
  connections.push({ from: 'is-cross-sale-cancelled', to: 'cross-sale', label: 'Yes' });
  connections.push({ from: 'cross-sale', to: 'renewal-email', curve: 'up' });

  nodes.push({
    id: 'prior-customer-bottom',
    type: 'automation',
    label: 'Prior\nCustomer',
    automation: findAutomation('prior'),
    colorScheme: 'prior',
    col: 3.5, row: 5.5
  });
  connections.push({ from: 'is-cross-sale-cancelled', to: 'prior-customer-bottom', label: 'No', direction: 'down' });

  return { nodes, connections };
}

// ============================================
// FLOWCHART CANVAS
// ============================================
const FlowchartCanvas = ({ flowchartData, templateMap, selectedNode, onSelectNode, t }) => {
  if (!flowchartData) {
    return (
      <div style={{ textAlign: 'center', color: t.textMuted, padding: '60px' }}>
        No flowchart data available
      </div>
    );
  }

  const { nodes, connections } = flowchartData;

  const nodeWidth = 100;
  const nodeHeight = 56;
  const colWidth = 120;
  const rowHeight = 90;
  const startX = 40;
  const startY = 30;

  const getNodePosition = (node) => ({
    x: startX + node.col * colWidth,
    y: startY + node.row * rowHeight
  });

  const maxCol = Math.max(...nodes.map(n => n.col)) + 1;
  const maxRow = Math.max(...nodes.map(n => n.row)) + 1;
  const canvasWidth = startX * 2 + maxCol * colWidth + nodeWidth;
  const canvasHeight = startY * 2 + maxRow * rowHeight + nodeHeight;

  const getConnectionPath = (conn) => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromPos = getNodePosition(fromNode);
    const toPos = getNodePosition(toNode);

    let x1, y1, x2, y2;

    // Exit point
    if (conn.direction === 'down') {
      x1 = fromPos.x + nodeWidth / 2;
      y1 = fromPos.y + nodeHeight;
    } else if (toNode.col > fromNode.col) {
      x1 = fromPos.x + nodeWidth;
      y1 = fromPos.y + nodeHeight / 2;
    } else if (toNode.row > fromNode.row) {
      x1 = fromPos.x + nodeWidth / 2;
      y1 = fromPos.y + nodeHeight;
    } else {
      x1 = fromPos.x + nodeWidth;
      y1 = fromPos.y + nodeHeight / 2;
    }

    // Entry point
    if (conn.direction === 'down' || toNode.row > fromNode.row) {
      x2 = toPos.x + nodeWidth / 2;
      y2 = toPos.y;
    } else if (toNode.col > fromNode.col) {
      x2 = toPos.x;
      y2 = toPos.y + nodeHeight / 2;
    } else {
      x2 = toPos.x + nodeWidth / 2;
      y2 = toPos.y + nodeHeight;
    }

    let path;
    if (conn.curve === 'up' || conn.curve === 'down') {
      const midX = (x1 + x2) / 2;
      const curveY = conn.curve === 'up' ? Math.min(y1, y2) - 25 : Math.max(y1, y2) + 25;
      path = `M ${x1} ${y1} Q ${midX} ${curveY} ${x2} ${y2}`;
    } else if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
      path = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else {
      const midX = x1 + 15;
      path = `M ${x1} ${y1} C ${midX} ${y1} ${x2 - 15} ${y2} ${x2} ${y2}`;
    }

    return { path, x1, y1, x2, y2 };
  };

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, minWidth: '100%' }}>
      {/* SVG for connections */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none' }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        {connections.map((conn, idx) => {
          const pathData = getConnectionPath(conn);
          if (!pathData) return null;

          const { path, x1, y1 } = pathData;

          return (
            <g key={idx}>
              <path
                d={path}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
              />
              {conn.label && (
                <g>
                  <rect
                    x={x1 + 6}
                    y={conn.direction === 'down' ? y1 + 6 : y1 - 18}
                    width={conn.label.length * 6 + 8}
                    height="16"
                    rx="4"
                    fill={t.cardBg}
                    stroke={t.border}
                    strokeWidth="1"
                  />
                  <text
                    x={x1 + 10}
                    y={conn.direction === 'down' ? y1 + 17 : y1 - 7}
                    fill={t.textMuted}
                    fontSize="10"
                    fontWeight="500"
                  >
                    {conn.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map(node => {
        const pos = getNodePosition(node);
        const isSelected = selectedNode?.id === node.id;

        if (node.type === 'decision') {
          return (
            <DecisionNode
              key={node.id}
              node={node}
              x={pos.x}
              y={pos.y}
              width={nodeWidth}
              height={nodeHeight}
              isSelected={isSelected}
              onClick={() => onSelectNode(node)}
              t={t}
            />
          );
        }

        return (
          <AutomationNode
            key={node.id}
            node={node}
            x={pos.x}
            y={pos.y}
            width={nodeWidth}
            height={nodeHeight}
            isSelected={isSelected}
            onClick={() => node.automation && onSelectNode(node)}
            t={t}
          />
        );
      })}
    </div>
  );
};

// ============================================
// AUTOMATION NODE
// ============================================
const AutomationNode = ({ node, x, y, width, height, isSelected, onClick, t }) => {
  const hasAutomation = !!node.automation;
  const scheme = colors[node.colorScheme] || colors.default;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        background: scheme.bg,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: hasAutomation ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        boxShadow: isSelected
          ? `0 0 0 2px ${scheme.border}, 0 4px 12px rgba(0,0,0,0.15)`
          : '0 2px 4px rgba(0,0,0,0.1)',
        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
        opacity: hasAutomation ? 1 : 0.7
      }}
      onMouseEnter={(e) => {
        if (hasAutomation) {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        }
      }}
    >
      <span style={{
        fontSize: '11px',
        fontWeight: '600',
        color: scheme.text,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.3',
        padding: '4px'
      }}>
        {node.label}
      </span>
    </div>
  );
};

// ============================================
// DECISION NODE (Diamond)
// ============================================
const DecisionNode = ({ node, x, y, width, height, isSelected, onClick, t }) => {
  const scheme = colors[node.colorScheme] || colors.decision;
  const size = Math.min(width, height) - 8;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x + (width - size) / 2,
        top: y + (height - size) / 2,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: `rotate(45deg) ${isSelected ? 'scale(1.05)' : 'scale(1)'}`,
        background: scheme.bg,
        border: `1.5px solid ${scheme.border}`,
        borderRadius: '4px',
        boxShadow: isSelected
          ? `0 0 0 2px ${scheme.border}, 0 4px 8px rgba(0,0,0,0.1)`
          : '0 2px 4px rgba(0,0,0,0.08)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'rotate(45deg) scale(1.05)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'rotate(45deg) scale(1)';
        }
      }}
    >
      <span style={{
        transform: 'rotate(-45deg)',
        fontSize: '10px',
        fontWeight: '600',
        color: scheme.text,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.2'
      }}>
        {node.label}
      </span>
    </div>
  );
};

// ============================================
// NODE DETAILS PANEL
// ============================================
const NodeDetailsPanel = ({ node, templateMap, onClose, t }) => {
  const automation = node.automation;
  if (!automation) return null;

  const templateKeys = [];
  const extractTemplates = (nodes) => {
    nodes?.forEach(n => {
      if (n.type === 'send_email') {
        const key = n.config?.templateKey || n.config?.template;
        if (key && !templateKeys.includes(key)) templateKeys.push(key);
      }
      if (n.branches) {
        extractTemplates(n.branches.yes);
        extractTemplates(n.branches.no);
      }
    });
  };
  extractTemplates(automation.nodes);

  const templates = templateKeys.map(key => templateMap?.[key]).filter(Boolean);
  const scheme = colors[node.colorScheme] || colors.default;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 99
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        background: t.cardBg,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '2px',
            background: scheme.bg,
            marginTop: '6px',
            flexShrink: 0
          }} />
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              color: t.text,
              fontWeight: '600'
            }}>
              {automation.name}
            </h3>
            {automation.description && (
              <p style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: t.textSecondary,
                lineHeight: '1.4'
              }}>
                {automation.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: t.textMuted,
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = t.inputBg || 'rgba(0,0,0,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px',
              background: getCategoryColor(automation.category) + '15',
              color: getCategoryColor(automation.category),
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {automation.category}
            </span>
            <span style={{
              padding: '4px 10px',
              background: t.inputBg || 'rgba(0,0,0,0.05)',
              color: t.textSecondary,
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {automation.lineOfBusiness}
            </span>
          </div>

          {/* Templates */}
          {templates.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{
                margin: '0 0 10px 0',
                fontSize: '11px',
                color: t.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: '600'
              }}>
                Email Templates
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {templates.map(template => (
                  <div
                    key={template.default_key}
                    style={{
                      padding: '12px 14px',
                      background: t.inputBg || 'rgba(0,0,0,0.03)',
                      borderRadius: '8px',
                      border: `1px solid ${t.border}`
                    }}
                  >
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: t.text,
                      marginBottom: '2px'
                    }}>
                      {template.name}
                    </div>
                    <div style={{ fontSize: '12px', color: t.textMuted }}>
                      {template.subject}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Steps */}
          <div>
            <h4 style={{
              margin: '0 0 10px 0',
              fontSize: '11px',
              color: t.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: '600'
            }}>
              Workflow Steps
            </h4>
            <WorkflowSteps nodes={automation.nodes} templateMap={templateMap} t={t} />
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================
// WORKFLOW STEPS
// ============================================
const WorkflowSteps = ({ nodes, templateMap, t }) => {
  if (!nodes || nodes.length === 0) {
    return <div style={{ color: t.textMuted, fontSize: '13px' }}>No steps defined</div>;
  }

  const displayNodes = nodes.filter(n => n.type !== 'entry_criteria');

  const nodeConfig = {
    trigger: { color: '#3b82f6', label: 'Trigger' },
    send_email: { color: '#10b981', label: 'Email' },
    delay: { color: '#f59e0b', label: 'Wait' },
    condition: { color: '#8b5cf6', label: 'Condition' },
    end: { color: '#64748b', label: 'End' }
  };

  const getLabel = (node) => {
    if (node.type === 'send_email') {
      const key = node.config?.templateKey || node.config?.template;
      return templateMap?.[key]?.name || 'Send Email';
    }
    if (node.type === 'delay') {
      const days = node.config?.days || 0;
      return `Wait ${days} day${days !== 1 ? 's' : ''}`;
    }
    if (node.type === 'condition') {
      return node.config?.type === 'email_opened' ? 'If Opened' : 'If Clicked';
    }
    if (node.type === 'trigger') {
      return `Daily at ${node.config?.time || '09:00'}`;
    }
    return node.title || node.type;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {displayNodes.map((node, idx) => {
        const config = nodeConfig[node.type] || { color: '#64748b' };
        return (
          <div key={node.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            background: t.inputBg || 'rgba(0,0,0,0.03)',
            borderLeft: `3px solid ${config.color}`,
            borderRadius: '0 6px 6px 0'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: config.color
            }} />
            <span style={{ fontSize: '13px', color: t.text, fontWeight: '500' }}>{getLabel(node)}</span>
          </div>
        );
      })}
    </div>
  );
};

function getCategoryColor(category) {
  const categoryColors = {
    'Onboarding': '#8b5cf6',
    'Retention': '#3b82f6',
    'Cross-Sell': '#22c55e',
    'Win-Back': '#f59e0b',
    'Engagement': '#ec4899'
  };
  return categoryColors[category] || '#64748b';
}

export default TimelinePage;
