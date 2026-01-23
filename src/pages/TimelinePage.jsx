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
      ...style
    }}
  />
);

const TimelinePage = ({ t }) => {
  // Line of business filter
  const [lobFilter, setLobFilter] = useState('Personal');
  // Selected node for details panel
  const [selectedNode, setSelectedNode] = useState(null);

  // Fetch lifecycle stages with automations
  const { data, isLoading, error } = useLifecycleStages();

  // Build the flowchart data based on filter
  const flowchartData = useMemo(() => {
    if (!data?.stages) return null;

    // Get all automations filtered by line of business
    const allAutomations = data.stages.flatMap(stage =>
      stage.automations.filter(a =>
        lobFilter === 'all' || a.lineOfBusiness === lobFilter || a.lineOfBusiness === 'All'
      )
    );

    return buildFlowchartStructure(allAutomations, lobFilter);
  }, [data?.stages, lobFilter]);

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <h3 style={{ color: t.text, marginBottom: '8px' }}>Failed to load timeline</h3>
        <p style={{ color: t.textMuted }}>{error.message}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
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
        gap: '12px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        alignItems: 'center'
      }}>
        {/* Line of Business Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: t.textSecondary }}>Line of Business:</span>
          <div style={{
            display: 'flex',
            backgroundColor: t.bgHover,
            borderRadius: '8px',
            padding: '4px'
          }}>
            <button
              onClick={() => setLobFilter('Personal')}
              style={{
                padding: '8px 16px',
                backgroundColor: lobFilter === 'Personal' ? t.primary : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: lobFilter === 'Personal' ? '#fff' : t.textSecondary,
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Personal
            </button>
            <button
              onClick={() => setLobFilter('Commercial')}
              style={{
                padding: '8px 16px',
                backgroundColor: lobFilter === 'Commercial' ? t.primary : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: lobFilter === 'Commercial' ? '#fff' : t.textSecondary,
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Commercial
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '20px',
              height: '20px',
              backgroundColor: t.bgCard,
              border: '2px solid #3b82f6',
              borderRadius: '4px'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Automation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="24" height="20" viewBox="0 0 24 20">
              <polygon
                points="12,2 22,10 12,18 2,10"
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
              />
            </svg>
            <span style={{ fontSize: '12px', color: t.textMuted }}>Decision</span>
          </div>
        </div>
      </div>

      {/* Flowchart Canvas */}
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        padding: '40px',
        minHeight: '700px',
        overflow: 'auto'
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
// Matches the diagram exactly
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

  // Grid positions (col, row) - using finer grid for precise placement
  // Row 0: Prospect path
  // Row 1: Welcome
  // Row 2: Is Cross Sale path (Yes -> Midterm)
  // Row 3: Is Cross Sale path (No -> No Feedback -> Periodic)
  // Row 4: Is Cancelled path
  // Row 5: Prior Customer from cancelled

  // === TOP LEFT: Prospect ===
  nodes.push({
    id: 'prospect',
    type: 'automation',
    label: 'Prospect',
    automation: findAutomation('prospect'),
    col: 0, row: 0
  });

  // Prospect Email (Not sold path)
  nodes.push({
    id: 'prospect-email',
    type: 'automation',
    label: 'Prospect\nEmail - 6',
    automation: findAutomation('prospect') || findAutomation('quoted'),
    col: 3, row: 0
  });
  connections.push({ from: 'prospect', to: 'prospect-email', label: 'Not sold', labelPos: 'top' });

  // === Welcome (Sold path) ===
  nodes.push({
    id: 'welcome',
    type: 'automation',
    label: 'Welcome',
    automation: findAutomation('welcome'),
    col: 0, row: 1.5
  });
  connections.push({ from: 'prospect', to: 'welcome', label: 'Sold', labelPos: 'left' });

  // === Is Cross Sale Decision ===
  nodes.push({
    id: 'is-cross-sale',
    type: 'decision',
    label: 'Is Cross\nSale',
    col: 2, row: 2
  });

  // Midterm Crossale (Yes from Cross Sale)
  nodes.push({
    id: 'midterm-crossale',
    type: 'automation',
    label: 'Midterm\nCrossale',
    automation: findAutomation('midterm') || findAutomation('cross-sell'),
    col: 3, row: 1.5
  });
  connections.push({ from: 'is-cross-sale', to: 'midterm-crossale', label: 'Yes', labelPos: 'top' });

  // No Feedback (No from Cross Sale)
  nodes.push({
    id: 'no-feedback',
    type: 'decision',
    label: 'No\nFeedback',
    col: 2, row: 3.5
  });
  connections.push({ from: 'is-cross-sale', to: 'no-feedback', label: 'No', labelPos: 'left' });

  // Periodic Feedback
  nodes.push({
    id: 'periodic-feedback',
    type: 'automation',
    label: 'Periodic\nFeedback',
    automation: findAutomation('periodic') || findAutomation('feedback'),
    col: 3.5, row: 3.5
  });
  connections.push({ from: 'no-feedback', to: 'periodic-feedback' });

  // === Renewal Email (center convergence point) ===
  nodes.push({
    id: 'renewal-email',
    type: 'automation',
    label: 'Renewal\nEmail',
    automation: findAutomation('renewal'),
    col: 5, row: 2
  });
  // Connections into Renewal Email
  connections.push({ from: 'midterm-crossale', to: 'renewal-email', curveDown: true });
  connections.push({ from: 'periodic-feedback', to: 'renewal-email', curveUp: true });

  // === Renewed Decision ===
  nodes.push({
    id: 'renewed',
    type: 'decision',
    label: 'Renewed',
    col: 6.5, row: 2
  });
  connections.push({ from: 'renewal-email', to: 'renewed' });

  // Renewed Email (Yes)
  nodes.push({
    id: 'renewed-email',
    type: 'automation',
    label: 'Renewed\nEmail',
    automation: findAutomation('renewed') || findAutomation('thank'),
    col: 8, row: 1.5
  });
  connections.push({ from: 'renewed', to: 'renewed-email', label: 'Yes', labelPos: 'top' });

  // Prior Customer (No from Renewed) - top right
  nodes.push({
    id: 'prior-customer-top',
    type: 'automation',
    label: 'Prior\nCustomer',
    automation: findAutomation('prior'),
    col: 8, row: 3
  });
  connections.push({ from: 'renewed', to: 'prior-customer-top', label: 'No', labelPos: 'bottom' });

  // === Bottom: Is Cancelled Path ===
  nodes.push({
    id: 'is-cancelled',
    type: 'decision',
    label: 'Is Cancelled',
    col: 0, row: 4.5
  });

  // Is Cross Sale (from Cancelled)
  nodes.push({
    id: 'is-cross-sale-cancelled',
    type: 'decision',
    label: 'Is Cross\nSale',
    col: 2, row: 4.5
  });
  connections.push({ from: 'is-cancelled', to: 'is-cross-sale-cancelled' });

  // Cross Sale automation (Yes from cancelled cross sale check)
  nodes.push({
    id: 'cross-sale',
    type: 'automation',
    label: 'Cross Sale',
    automation: findAutomation('cross') || findAutomation('midterm'),
    col: 3.5, row: 4.5
  });
  connections.push({ from: 'is-cross-sale-cancelled', to: 'cross-sale', label: 'Yes', labelPos: 'top' });
  // Cross Sale connects up to Renewal Email
  connections.push({ from: 'cross-sale', to: 'renewal-email', curveUp: true });

  // Prior Customer (No from cancelled cross sale)
  nodes.push({
    id: 'prior-customer-bottom',
    type: 'automation',
    label: 'Prior\nCustomer',
    automation: findAutomation('prior'),
    col: 3.5, row: 5.5
  });
  connections.push({ from: 'is-cross-sale-cancelled', to: 'prior-customer-bottom', label: 'No', labelPos: 'left' });

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

  // Grid settings
  const nodeWidth = 100;
  const nodeHeight = 55;
  const colWidth = 120;
  const rowHeight = 90;
  const startX = 40;
  const startY = 30;

  // Calculate node position from grid coords
  const getNodePosition = (node) => ({
    x: startX + node.col * colWidth,
    y: startY + node.row * rowHeight
  });

  // Calculate canvas size
  const maxCol = Math.max(...nodes.map(n => n.col)) + 1;
  const maxRow = Math.max(...nodes.map(n => n.row)) + 1;
  const canvasWidth = startX * 2 + maxCol * colWidth + nodeWidth;
  const canvasHeight = startY * 2 + maxRow * rowHeight + nodeHeight;

  // Generate connection path
  const getConnectionPath = (conn) => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return null;

    const fromPos = getNodePosition(fromNode);
    const toPos = getNodePosition(toNode);

    // Calculate exit/entry points
    let x1, y1, x2, y2;

    // Exit point
    if (toNode.col > fromNode.col) {
      // Going right - exit from right
      x1 = fromPos.x + nodeWidth;
      y1 = fromPos.y + nodeHeight / 2;
    } else if (toNode.row > fromNode.row) {
      // Going down - exit from bottom
      x1 = fromPos.x + nodeWidth / 2;
      y1 = fromPos.y + nodeHeight;
    } else if (toNode.row < fromNode.row) {
      // Going up - exit from top
      x1 = fromPos.x + nodeWidth / 2;
      y1 = fromPos.y;
    } else {
      x1 = fromPos.x + nodeWidth;
      y1 = fromPos.y + nodeHeight / 2;
    }

    // Entry point
    if (toNode.col > fromNode.col) {
      // Coming from left
      x2 = toPos.x;
      y2 = toPos.y + nodeHeight / 2;
    } else if (toNode.row > fromNode.row) {
      // Coming from top
      x2 = toPos.x + nodeWidth / 2;
      y2 = toPos.y;
    } else if (toNode.row < fromNode.row) {
      // Coming from bottom
      x2 = toPos.x + nodeWidth / 2;
      y2 = toPos.y + nodeHeight;
    } else {
      x2 = toPos.x;
      y2 = toPos.y + nodeHeight / 2;
    }

    // Generate path
    let path;
    if (conn.curveUp || conn.curveDown) {
      // Curved path for connections that go around
      const midX = (x1 + x2) / 2;
      const curveOffset = conn.curveUp ? -40 : 40;
      path = `M ${x1} ${y1} Q ${midX} ${y1 + curveOffset} ${x2} ${y2}`;
    } else if (Math.abs(x1 - x2) < 5 || Math.abs(y1 - y2) < 5) {
      // Straight line
      path = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else {
      // L-shaped or S-shaped path
      if (toNode.row === fromNode.row) {
        // Same row - straight with slight curve
        path = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else {
        // Different row - L-shape
        const midX = x1 + (x2 - x1) * 0.3;
        path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      }
    }

    return { path, x1, y1, x2, y2, fromNode, toNode };
  };

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, minWidth: '100%' }}>
      {/* SVG for connections */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none' }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
          </marker>
        </defs>

        {connections.map((conn, idx) => {
          const pathData = getConnectionPath(conn);
          if (!pathData) return null;

          const { path, x1, y1, fromNode, toNode } = pathData;

          // Label position
          let labelX = x1 + 10;
          let labelY = y1 - 8;
          if (conn.labelPos === 'left') {
            labelX = x1 - 5;
            labelY = y1 + 15;
          } else if (conn.labelPos === 'bottom') {
            labelY = y1 + 20;
          }

          return (
            <g key={idx}>
              <path
                d={path}
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
              {conn.label && (
                <text
                  x={labelX}
                  y={labelY}
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="500"
                >
                  {conn.label}
                </text>
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
// AUTOMATION NODE (Rectangle)
// ============================================
const AutomationNode = ({ node, x, y, width, height, isSelected, onClick, t }) => {
  const hasAutomation = !!node.automation;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        backgroundColor: t.bgCard,
        border: `2px solid ${isSelected ? t.primary : '#64748b'}`,
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: hasAutomation ? 'pointer' : 'default',
        transition: 'all 0.15s',
        boxShadow: isSelected ? `0 0 0 3px ${t.primary}30` : 'none'
      }}
    >
      <span style={{
        fontSize: '12px',
        fontWeight: '600',
        color: hasAutomation ? t.text : t.textMuted,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.25',
        padding: '4px'
      }}>
        {node.label}
      </span>
    </div>
  );
};

// ============================================
// DECISION NODE (Hexagon)
// ============================================
const DecisionNode = ({ node, x, y, width, height, isSelected, onClick, t }) => {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute' }}
      >
        <polygon
          points={`
            ${width * 0.12},${height / 2}
            ${width * 0.30},${height * 0.08}
            ${width * 0.70},${height * 0.08}
            ${width * 0.88},${height / 2}
            ${width * 0.70},${height * 0.92}
            ${width * 0.30},${height * 0.92}
          `}
          fill={t.bgCard}
          stroke={isSelected ? t.primary : '#64748b'}
          strokeWidth="2"
        />
      </svg>
      <span style={{
        position: 'relative',
        fontSize: '11px',
        fontWeight: '600',
        color: t.text,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.2',
        zIndex: 1
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

  // Get templates used
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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '380px',
      backgroundColor: t.bgCard,
      borderLeft: `1px solid ${t.border}`,
      boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
      zIndex: 100,
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
        justifyContent: 'space-between'
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: t.text, fontWeight: '600' }}>
          {automation.name}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* Description */}
        {automation.description && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: t.textSecondary, lineHeight: '1.5' }}>
              {automation.description}
            </p>
          </div>
        )}

        {/* Badges */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{
            padding: '4px 10px',
            backgroundColor: `${getCategoryColor(automation.category)}20`,
            color: getCategoryColor(automation.category),
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600'
          }}>
            {automation.category}
          </span>
          <span style={{
            padding: '4px 10px',
            backgroundColor: t.bgHover,
            color: t.textSecondary,
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '500'
          }}>
            {automation.lineOfBusiness}
          </span>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{
              margin: '0 0 10px 0',
              fontSize: '11px',
              color: t.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Email Templates
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map(template => (
                <div
                  key={template.default_key}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: t.bgHover,
                    borderRadius: '6px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: '600', color: t.text, marginBottom: '2px' }}>
                    {template.name}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>
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
            letterSpacing: '0.5px'
          }}>
            Workflow Steps
          </h4>
          <WorkflowSteps nodes={automation.nodes} templateMap={templateMap} t={t} />
        </div>
      </div>
    </div>
  );
};

// ============================================
// WORKFLOW STEPS
// ============================================
const WorkflowSteps = ({ nodes, templateMap, t }) => {
  if (!nodes || nodes.length === 0) {
    return <div style={{ color: t.textMuted, fontSize: '12px' }}>No steps defined</div>;
  }

  const displayNodes = nodes.filter(n => n.type !== 'entry_criteria');

  const nodeIcons = {
    trigger: '⚡',
    send_email: '📧',
    delay: '⏱',
    condition: '🔀',
    end: '🏁'
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
      return node.config?.type === 'email_opened' ? 'If Opened?' : 'If Clicked?';
    }
    if (node.type === 'trigger') {
      return `Daily at ${node.config?.time || '09:00'}`;
    }
    return node.title || node.type;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {displayNodes.map((node, idx) => (
        <div key={node.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          backgroundColor: t.bgHover,
          borderRadius: '6px'
        }}>
          <span style={{ fontSize: '14px' }}>{nodeIcons[node.type] || '?'}</span>
          <span style={{ fontSize: '12px', color: t.text }}>{getLabel(node)}</span>
        </div>
      ))}
    </div>
  );
};

function getCategoryColor(category) {
  const colors = {
    'Onboarding': '#8b5cf6',
    'Retention': '#3b82f6',
    'Cross-Sell': '#22c55e',
    'Win-Back': '#f59e0b',
    'Engagement': '#ec4899'
  };
  return colors[category] || '#71717a';
}

export default TimelinePage;
