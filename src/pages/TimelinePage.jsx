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

// Color palette for the flowchart
const colors = {
  prospect: { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '#667eea', text: '#fff' },
  welcome: { bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', border: '#11998e', text: '#fff' },
  crossSale: { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', border: '#f093fb', text: '#fff' },
  renewal: { bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', border: '#4facfe', text: '#fff' },
  renewed: { bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', border: '#43e97b', text: '#fff' },
  prior: { bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', border: '#fa709a', text: '#fff' },
  periodic: { bg: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', border: '#a8edea', text: '#374151' },
  decision: { bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', border: '#fcb69f', text: '#374151' },
  cancelled: { bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', border: '#ff9a9e', text: '#374151' },
  default: { bg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', border: '#c7d2fe', text: '#374151' }
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
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <h3 style={{ color: '#fff', marginBottom: '8px' }}>Failed to load timeline</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>{error.message}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '8px'
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
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(102,126,234,0.2)',
        backdropFilter: 'blur(10px)',
        alignItems: 'center'
      }}>
        {/* Line of Business Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: t.textSecondary, fontWeight: '500' }}>Line of Business:</span>
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '12px',
            padding: '4px'
          }}>
            {['Personal', 'Commercial'].map(lob => (
              <button
                key={lob}
                onClick={() => setLobFilter(lob)}
                style={{
                  padding: '10px 20px',
                  background: lobFilter === lob
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  color: lobFilter === lob ? '#fff' : t.textSecondary,
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: lobFilter === lob ? '0 4px 15px rgba(102,126,234,0.4)' : 'none'
                }}
              >
                {lob}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(79,172,254,0.4)'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Automation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
              borderRadius: '6px',
              transform: 'rotate(45deg)',
              boxShadow: '0 2px 8px rgba(252,182,159,0.4)'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Decision</span>
          </div>
        </div>
      </div>

      {/* Flowchart Canvas */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '50px',
        minHeight: '700px',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Background pattern */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)`,
          backgroundSize: '40px 40px',
          borderRadius: '20px',
          pointerEvents: 'none'
        }} />

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
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '60px' }}>
        No flowchart data available
      </div>
    );
  }

  const { nodes, connections } = flowchartData;

  const nodeWidth = 110;
  const nodeHeight = 60;
  const colWidth = 130;
  const rowHeight = 95;
  const startX = 50;
  const startY = 40;

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
      const curveY = conn.curve === 'up' ? Math.min(y1, y2) - 30 : Math.max(y1, y2) + 30;
      path = `M ${x1} ${y1} Q ${midX} ${curveY} ${x2} ${y2}`;
    } else if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
      path = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else {
      const midX = x1 + 20;
      path = `M ${x1} ${y1} C ${midX} ${y1} ${x2 - 20} ${y2} ${x2} ${y2}`;
    }

    return { path, x1, y1, x2, y2 };
  };

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, minWidth: '100%' }}>
      {/* SVG for connections */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none' }}>
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#667eea" />
            <stop offset="100%" stopColor="#764ba2" />
          </linearGradient>
          <marker
            id="arrowhead"
            markerWidth="12"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 12 4, 0 8" fill="url(#lineGradient)" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {connections.map((conn, idx) => {
          const pathData = getConnectionPath(conn);
          if (!pathData) return null;

          const { path, x1, y1 } = pathData;

          return (
            <g key={idx}>
              {/* Glow effect */}
              <path
                d={path}
                fill="none"
                stroke="rgba(102,126,234,0.3)"
                strokeWidth="6"
                markerEnd="url(#arrowhead)"
              />
              {/* Main line */}
              <path
                d={path}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2.5"
                markerEnd="url(#arrowhead)"
                style={{ filter: 'url(#glow)' }}
              />
              {conn.label && (
                <g>
                  <rect
                    x={x1 + 8}
                    y={conn.direction === 'down' ? y1 + 8 : y1 - 22}
                    width={conn.label.length * 7 + 12}
                    height="18"
                    rx="9"
                    fill="rgba(30,41,59,0.9)"
                    stroke="rgba(102,126,234,0.5)"
                    strokeWidth="1"
                  />
                  <text
                    x={x1 + 14}
                    y={conn.direction === 'down' ? y1 + 20 : y1 - 10}
                    fill="#a5b4fc"
                    fontSize="10"
                    fontWeight="600"
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
          />
        );
      })}
    </div>
  );
};

// ============================================
// AUTOMATION NODE
// ============================================
const AutomationNode = ({ node, x, y, width, height, isSelected, onClick }) => {
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
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: hasAutomation ? 'pointer' : 'default',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isSelected
          ? `0 0 0 3px #fff, 0 0 30px ${scheme.border}`
          : `0 8px 25px -5px rgba(0,0,0,0.3), 0 0 15px ${scheme.border}40`,
        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
        border: `2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.2)'}`
      }}
      onMouseEnter={(e) => {
        if (hasAutomation) {
          e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 12px 35px -5px rgba(0,0,0,0.4), 0 0 25px ${scheme.border}60`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = `0 8px 25px -5px rgba(0,0,0,0.3), 0 0 15px ${scheme.border}40`;
        }
      }}
    >
      <span style={{
        fontSize: '12px',
        fontWeight: '700',
        color: scheme.text,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.3',
        padding: '6px',
        textShadow: scheme.text === '#fff' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
      }}>
        {node.label}
      </span>
    </div>
  );
};

// ============================================
// DECISION NODE (Hexagon)
// ============================================
const DecisionNode = ({ node, x, y, width, height, isSelected, onClick }) => {
  const scheme = colors[node.colorScheme] || colors.decision;

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
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
        filter: isSelected ? 'drop-shadow(0 0 20px rgba(252,182,159,0.6))' : 'drop-shadow(0 8px 15px rgba(0,0,0,0.3))'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.08)';
        e.currentTarget.style.filter = 'drop-shadow(0 0 25px rgba(252,182,159,0.7))';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.filter = 'drop-shadow(0 8px 15px rgba(0,0,0,0.3))';
        }
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute' }}
      >
        <defs>
          <linearGradient id={`hexGrad-${node.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffecd2" />
            <stop offset="100%" stopColor="#fcb69f" />
          </linearGradient>
        </defs>
        <polygon
          points={`
            ${width * 0.10},${height / 2}
            ${width * 0.28},${height * 0.05}
            ${width * 0.72},${height * 0.05}
            ${width * 0.90},${height / 2}
            ${width * 0.72},${height * 0.95}
            ${width * 0.28},${height * 0.95}
          `}
          fill={`url(#hexGrad-${node.id})`}
          stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.5)'}
          strokeWidth={isSelected ? '3' : '2'}
        />
      </svg>
      <span style={{
        position: 'relative',
        fontSize: '11px',
        fontWeight: '700',
        color: '#374151',
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
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 99,
          backdropFilter: 'blur(4px)'
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideIn 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          background: scheme.bg,
          position: 'relative'
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            ×
          </button>
          <h3 style={{
            margin: 0,
            fontSize: '20px',
            color: scheme.text,
            fontWeight: '700',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {automation.name}
          </h3>
          {automation.description && (
            <p style={{
              margin: '8px 0 0',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.8)',
              lineHeight: '1.5'
            }}>
              {automation.description}
            </p>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '6px 14px',
              background: `linear-gradient(135deg, ${getCategoryColor(automation.category)}40, ${getCategoryColor(automation.category)}20)`,
              border: `1px solid ${getCategoryColor(automation.category)}60`,
              color: getCategoryColor(automation.category),
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {automation.category}
            </span>
            <span style={{
              padding: '6px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {automation.lineOfBusiness}
            </span>
          </div>

          {/* Templates */}
          {templates.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{
                margin: '0 0 12px 0',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: '600'
              }}>
                Email Templates
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {templates.map(template => (
                  <div
                    key={template.default_key}
                    style={{
                      padding: '14px 16px',
                      background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
                      border: '1px solid rgba(102,126,234,0.2)',
                      borderRadius: '12px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#fff',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '16px' }}>📧</span>
                      {template.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
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
              margin: '0 0 12px 0',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: '600'
            }}>
              Workflow Steps
            </h4>
            <WorkflowSteps nodes={automation.nodes} templateMap={templateMap} />
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================
// WORKFLOW STEPS
// ============================================
const WorkflowSteps = ({ nodes, templateMap }) => {
  if (!nodes || nodes.length === 0) {
    return <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>No steps defined</div>;
  }

  const displayNodes = nodes.filter(n => n.type !== 'entry_criteria');

  const nodeConfig = {
    trigger: { icon: '⚡', color: '#60a5fa', label: 'Trigger' },
    send_email: { icon: '📧', color: '#34d399', label: 'Email' },
    delay: { icon: '⏱', color: '#fbbf24', label: 'Wait' },
    condition: { icon: '🔀', color: '#a78bfa', label: 'Condition' },
    end: { icon: '🏁', color: '#94a3b8', label: 'End' }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {displayNodes.map((node, idx) => {
        const config = nodeConfig[node.type] || { icon: '?', color: '#94a3b8' };
        return (
          <div key={node.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 14px',
            background: `linear-gradient(90deg, ${config.color}15 0%, transparent 100%)`,
            borderLeft: `3px solid ${config.color}`,
            borderRadius: '0 10px 10px 0'
          }}>
            <span style={{ fontSize: '18px' }}>{config.icon}</span>
            <span style={{ fontSize: '13px', color: '#fff', fontWeight: '500' }}>{getLabel(node)}</span>
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
  return categoryColors[category] || '#94a3b8';
}

export default TimelinePage;
