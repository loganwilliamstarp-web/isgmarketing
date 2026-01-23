// src/pages/TimelinePage.jsx
import React, { useState, useMemo, useCallback } from 'react';
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

    // Build the flowchart structure
    // This defines the logical flow of the customer journey
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
        <Skeleton height="500px" />
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
              border: `2px solid ${t.border}`,
              borderRadius: '4px'
            }} />
            <span style={{ fontSize: '12px', color: t.textMuted }}>Automation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="24" height="20" viewBox="0 0 24 20">
              <polygon
                points="12,0 24,10 12,20 0,10"
                fill="none"
                stroke={t.border}
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
        minHeight: '600px',
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
      {selectedNode && (
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
  // Find automations by category/type
  const findAutomation = (namePattern) => {
    return automations.find(a =>
      a.name?.toLowerCase().includes(namePattern.toLowerCase()) ||
      a.default_key?.toLowerCase().includes(namePattern.toLowerCase())
    );
  };

  // Build the flowchart nodes and connections
  const nodes = [];
  const connections = [];

  // ROW 1: Welcome -> Is Cross Sale? -> Midterm Cross Sale
  //                                  -> No Email
  const welcomeAuto = findAutomation('welcome');
  const midtermCrossAuto = findAutomation('midterm') || findAutomation('cross');
  const renewalAuto = findAutomation('renewal');
  const renewedAuto = findAutomation('renewed') || findAutomation('policy renewed');

  // Welcome node
  if (welcomeAuto) {
    nodes.push({
      id: 'welcome',
      type: 'automation',
      label: 'Welcome',
      automation: welcomeAuto,
      x: 0,
      y: 0
    });
  }

  // Cross Sale Decision
  nodes.push({
    id: 'is-cross-sale',
    type: 'decision',
    label: 'Is Cross\nSale?',
    x: 1,
    y: 0
  });

  if (welcomeAuto) {
    connections.push({ from: 'welcome', to: 'is-cross-sale' });
  }

  // Midterm Cross Sale (Yes path)
  if (midtermCrossAuto) {
    nodes.push({
      id: 'midterm-cross',
      type: 'automation',
      label: 'Midterm\nCrosssale',
      automation: midtermCrossAuto,
      x: 2,
      y: 0
    });
    connections.push({ from: 'is-cross-sale', to: 'midterm-cross', label: 'Yes' });
  }

  // No Email (No path)
  nodes.push({
    id: 'no-email',
    type: 'automation',
    label: 'No Email',
    isPlaceholder: true,
    x: 2,
    y: 1
  });
  connections.push({ from: 'is-cross-sale', to: 'no-email', label: 'No' });

  // ROW 2: Renewal flow
  // Is Renewal? -> Renewal Email -> Is Renewed? -> Renewed Email
  //                                            -> Lost Customer

  nodes.push({
    id: 'is-renewal',
    type: 'decision',
    label: 'Is\nRenewal?',
    x: 0,
    y: 2
  });

  if (renewalAuto) {
    nodes.push({
      id: 'renewal',
      type: 'automation',
      label: 'Renewal\nEmail',
      automation: renewalAuto,
      x: 1,
      y: 2
    });
    connections.push({ from: 'is-renewal', to: 'renewal', label: 'Yes' });
  }

  nodes.push({
    id: 'is-renewed',
    type: 'decision',
    label: 'Is\nRenewed?',
    x: 2,
    y: 2
  });

  if (renewalAuto) {
    connections.push({ from: 'renewal', to: 'is-renewed' });
  }

  if (renewedAuto) {
    nodes.push({
      id: 'renewed',
      type: 'automation',
      label: 'Renewed\nEmail',
      automation: renewedAuto,
      x: 3,
      y: 2
    });
    connections.push({ from: 'is-renewed', to: 'renewed', label: 'Yes' });
  }

  nodes.push({
    id: 'lost-customer',
    type: 'automation',
    label: 'Lost\nCustomer',
    isPlaceholder: true,
    x: 3,
    y: 3
  });
  connections.push({ from: 'is-renewed', to: 'lost-customer', label: 'No' });

  // ROW 3: Win-back / Prospect flows
  const prospectAuto = findAutomation('prospect');
  const priorCustomerAuto = findAutomation('prior');
  const periodicAuto = findAutomation('periodic');

  // Quoted not sold / Prospect
  if (prospectAuto) {
    nodes.push({
      id: 'prospect',
      type: 'automation',
      label: 'Quoted not\nsold',
      automation: prospectAuto,
      x: 0,
      y: 4
    });
  }

  // Prior customer
  if (priorCustomerAuto) {
    nodes.push({
      id: 'prior-customer',
      type: 'automation',
      label: 'Prior\nCustomer',
      automation: priorCustomerAuto,
      x: 1,
      y: 4
    });
  }

  // Periodic review
  if (periodicAuto) {
    nodes.push({
      id: 'periodic',
      type: 'automation',
      label: 'Periodic\nReview',
      automation: periodicAuto,
      x: 2,
      y: 4
    });
  }

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
  const nodeWidth = 130;
  const nodeHeight = 70;
  const horizontalGap = 180;
  const verticalGap = 120;
  const startX = 60;
  const startY = 40;

  // Calculate node position
  const getNodePosition = (node) => ({
    x: startX + node.x * horizontalGap,
    y: startY + node.y * verticalGap
  });

  // Calculate canvas size
  const maxX = Math.max(...nodes.map(n => n.x)) + 1;
  const maxY = Math.max(...nodes.map(n => n.y)) + 1;
  const canvasWidth = startX * 2 + maxX * horizontalGap;
  const canvasHeight = startY * 2 + maxY * verticalGap;

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, minWidth: '100%' }}>
      {/* SVG for connections */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={t.textMuted} />
          </marker>
        </defs>

        {connections.map((conn, idx) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const fromPos = getNodePosition(fromNode);
          const toPos = getNodePosition(toNode);

          // Calculate connection points
          let x1, y1, x2, y2;

          if (fromNode.type === 'decision') {
            // From decision - exit from right or bottom
            if (toNode.y === fromNode.y) {
              // Same row - go right
              x1 = fromPos.x + nodeWidth;
              y1 = fromPos.y + nodeHeight / 2;
            } else {
              // Different row - go down
              x1 = fromPos.x + nodeWidth / 2;
              y1 = fromPos.y + nodeHeight;
            }
          } else {
            // From automation - exit from right
            x1 = fromPos.x + nodeWidth;
            y1 = fromPos.y + nodeHeight / 2;
          }

          // Entry point - left side or top
          if (toNode.x > fromNode.x) {
            x2 = toPos.x;
            y2 = toPos.y + nodeHeight / 2;
          } else {
            x2 = toPos.x + nodeWidth / 2;
            y2 = toPos.y;
          }

          // Create path
          let path;
          if (x1 === x2 || y1 === y2) {
            // Straight line
            path = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // L-shaped path
            const midX = x1 + (x2 - x1) / 2;
            path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
          }

          return (
            <g key={idx}>
              <path
                d={path}
                fill="none"
                stroke={t.textMuted}
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
              {conn.label && (
                <text
                  x={x1 + 15}
                  y={y1 + (toNode.y > fromNode.y ? 20 : -8)}
                  fill={conn.label === 'Yes' ? '#22c55e' : '#ef4444'}
                  fontSize="11"
                  fontWeight="600"
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
  const bgColor = node.isPlaceholder ? t.bgHover : t.bgCard;
  const borderColor = isSelected ? t.primary : (node.isPlaceholder ? t.border : '#3b82f6');

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: hasAutomation ? 'pointer' : 'default',
        transition: 'all 0.2s',
        boxShadow: isSelected ? `0 0 0 3px ${t.primary}30` : 'none'
      }}
    >
      <span style={{
        fontSize: '13px',
        fontWeight: '600',
        color: node.isPlaceholder ? t.textMuted : t.text,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        lineHeight: '1.3'
      }}>
        {node.label}
      </span>
    </div>
  );
};

// ============================================
// DECISION NODE (Hexagon/Diamond)
// ============================================
const DecisionNode = ({ node, x, y, width, height, isSelected, onClick, t }) => {
  const borderColor = isSelected ? t.primary : '#f59e0b';

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
      {/* Hexagon shape using SVG */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute' }}
      >
        <polygon
          points={`
            ${width * 0.15},${height / 2}
            ${width * 0.35},${height * 0.1}
            ${width * 0.65},${height * 0.1}
            ${width * 0.85},${height / 2}
            ${width * 0.65},${height * 0.9}
            ${width * 0.35},${height * 0.9}
          `}
          fill={t.bgCard}
          stroke={borderColor}
          strokeWidth="2"
        />
      </svg>
      <span style={{
        position: 'relative',
        fontSize: '12px',
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
      width: '400px',
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
        padding: '20px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: t.text }}>
          {automation.name}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {/* Description */}
        {automation.description && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{
              margin: '0 0 8px 0',
              fontSize: '12px',
              color: t.textMuted,
              textTransform: 'uppercase'
            }}>
              Description
            </h4>
            <p style={{ margin: 0, fontSize: '14px', color: t.textSecondary, lineHeight: '1.5' }}>
              {automation.description}
            </p>
          </div>
        )}

        {/* Category & Line of Business */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            padding: '6px 12px',
            backgroundColor: `${getCategoryColor(automation.category)}20`,
            color: getCategoryColor(automation.category),
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            {automation.category}
          </div>
          <div style={{
            padding: '6px 12px',
            backgroundColor: t.bgHover,
            color: t.textSecondary,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            {automation.lineOfBusiness} Lines
          </div>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div>
            <h4 style={{
              margin: '0 0 12px 0',
              fontSize: '12px',
              color: t.textMuted,
              textTransform: 'uppercase'
            }}>
              Email Templates ({templates.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {templates.map(template => (
                <div
                  key={template.default_key}
                  style={{
                    padding: '12px',
                    backgroundColor: t.bgHover,
                    borderRadius: '8px'
                  }}
                >
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: t.text,
                    marginBottom: '4px'
                  }}>
                    {template.name}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: t.textSecondary
                  }}>
                    Subject: {template.subject}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflow Preview */}
        <div style={{ marginTop: '20px' }}>
          <h4 style={{
            margin: '0 0 12px 0',
            fontSize: '12px',
            color: t.textMuted,
            textTransform: 'uppercase'
          }}>
            Workflow Steps
          </h4>
          <WorkflowPreview nodes={automation.nodes} templateMap={templateMap} t={t} />
        </div>
      </div>
    </div>
  );
};

// ============================================
// WORKFLOW PREVIEW (Mini flowchart)
// ============================================
const WorkflowPreview = ({ nodes, templateMap, t }) => {
  if (!nodes || nodes.length === 0) {
    return <div style={{ color: t.textMuted, fontSize: '13px' }}>No steps defined</div>;
  }

  const displayNodes = nodes.filter(n => n.type !== 'entry_criteria');

  const nodeTypes = {
    trigger: { icon: '⚡', color: '#3b82f6' },
    send_email: { icon: '📧', color: '#22c55e' },
    delay: { icon: '⏱', color: '#f59e0b' },
    condition: { icon: '🔀', color: '#a78bfa' },
    end: { icon: '🏁', color: '#71717a' }
  };

  const getNodeLabel = (node) => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {displayNodes.map((node, idx) => {
        const type = nodeTypes[node.type] || { icon: '?', color: '#71717a' };
        return (
          <React.Fragment key={node.id}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              backgroundColor: `${type.color}10`,
              borderRadius: '8px',
              borderLeft: `3px solid ${type.color}`
            }}>
              <span style={{ fontSize: '16px' }}>{type.icon}</span>
              <span style={{ fontSize: '13px', color: t.text }}>
                {getNodeLabel(node)}
              </span>
            </div>
            {idx < displayNodes.length - 1 && !node.branches && (
              <div style={{
                width: '2px',
                height: '12px',
                backgroundColor: t.border,
                marginLeft: '20px'
              }} />
            )}
            {node.branches && (
              <div style={{
                marginLeft: '20px',
                paddingLeft: '12px',
                borderLeft: `2px dashed ${t.border}`,
                fontSize: '11px',
                color: t.textMuted
              }}>
                <div style={{ color: '#22c55e', marginBottom: '4px' }}>
                  Yes: {node.branches.yes?.length || 0} step(s)
                </div>
                <div style={{ color: '#ef4444' }}>
                  No: {node.branches.no?.length || 0} step(s)
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Helper function
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
