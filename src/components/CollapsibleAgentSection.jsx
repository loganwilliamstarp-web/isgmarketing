// src/components/CollapsibleAgentSection.jsx
import React, { useState, useEffect } from 'react';

/**
 * CollapsibleAgentSection - A collapsible section for grouping items by agent
 * Used in Automations and Templates pages for agency admin view
 *
 * @param {Object} props
 * @param {string} props.agentId - The agent's user ID
 * @param {string} props.agentName - The agent's display name
 * @param {string} props.agentEmail - The agent's email (optional, for display)
 * @param {number} props.itemCount - Number of items in this section
 * @param {number} props.activeCount - Number of active items (shown as green badge if >= 1)
 * @param {boolean} props.isCurrentUser - Whether this is the current logged-in user's section
 * @param {boolean} props.defaultExpanded - Whether to start expanded (defaults to false unless isCurrentUser)
 * @param {boolean} props.forceExpanded - External control to force expanded state (for Expand All)
 * @param {boolean} props.forceCollapsed - External control to force collapsed state (for Collapse All)
 * @param {React.ReactNode} props.children - The content to show when expanded
 * @param {Object} props.theme - Theme object (t)
 */
const CollapsibleAgentSection = ({
  agentId,
  agentName,
  agentEmail,
  itemCount,
  activeCount = 0,
  isCurrentUser = false,
  defaultExpanded,
  forceExpanded,
  forceCollapsed,
  children,
  theme: t
}) => {
  // Determine initial expanded state
  const initialExpanded = defaultExpanded !== undefined ? defaultExpanded : isCurrentUser;
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Handle external force expand/collapse
  useEffect(() => {
    if (forceExpanded === true) {
      setIsExpanded(true);
    } else if (forceCollapsed === true) {
      setIsExpanded(false);
    }
  }, [forceExpanded, forceCollapsed]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '12px',
        overflow: 'hidden'
      }}
    >
      {/* Header - Always visible */}
      <button
        onClick={toggleExpanded}
        style={{
          width: '100%',
          padding: '16px 20px',
          backgroundColor: isExpanded ? t.bgHover : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'background-color 0.15s'
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) e.currentTarget.style.backgroundColor = t.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Expand/Collapse Icon */}
        <span
          style={{
            fontSize: '12px',
            color: t.textMuted,
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block'
          }}
        >
          ▶
        </span>

        {/* Agent Icon */}
        <div
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: isCurrentUser ? `${t.primary}20` : t.bgHover,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            flexShrink: 0
          }}
        >
          {isCurrentUser ? '👤' : '👤'}
        </div>

        {/* Agent Info */}
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: '600',
              color: t.text,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {agentName}
            </span>
            {isCurrentUser && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  backgroundColor: t.primary,
                  color: '#fff',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}
              >
                You
              </span>
            )}
          </div>
          {agentEmail && (
            <div
              style={{
                fontSize: '12px',
                color: t.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {agentEmail}
            </div>
          )}
        </div>

        {/* Active Count Badge (green) */}
        {activeCount >= 1 && (
          <div
            style={{
              padding: '4px 10px',
              backgroundColor: `${t.success}15`,
              borderRadius: '20px',
              fontSize: '13px',
              color: t.success,
              fontWeight: '600',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '8px' }}>●</span>
            {activeCount} active
          </div>
        )}

        {/* Item Count Badge */}
        <div
          style={{
            padding: '4px 12px',
            backgroundColor: t.bgHover,
            borderRadius: '20px',
            fontSize: '13px',
            color: t.textSecondary,
            fontWeight: '500',
            flexShrink: 0
          }}
        >
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </div>
      </button>

      {/* Content - Shown when expanded */}
      {isExpanded && (
        <div
          style={{
            borderTop: `1px solid ${t.border}`
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * AgentGroupControls - Expand All / Collapse All buttons
 */
export const AgentGroupControls = ({ onExpandAll, onCollapseAll, theme: t }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px'
      }}
    >
      <button
        onClick={onExpandAll}
        style={{
          padding: '8px 12px',
          backgroundColor: 'transparent',
          border: `1px solid ${t.border}`,
          borderRadius: '6px',
          color: t.textSecondary,
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        <span style={{ fontSize: '10px' }}>▼</span> Expand All
      </button>
      <button
        onClick={onCollapseAll}
        style={{
          padding: '8px 12px',
          backgroundColor: 'transparent',
          border: `1px solid ${t.border}`,
          borderRadius: '6px',
          color: t.textSecondary,
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        <span style={{ fontSize: '10px' }}>▶</span> Collapse All
      </button>
    </div>
  );
};

/**
 * Helper function to group items by owner
 * @param {Array} items - Array of items with owner_id, ownerName, ownerEmail
 * @param {string} currentUserId - The current user's ID (to put at top)
 * @returns {Array} Array of { agentId, agentName, agentEmail, items }
 */
export const groupItemsByOwner = (items, currentUserId) => {
  if (!items || items.length === 0) return [];

  // Group by owner_id
  const groupMap = {};
  items.forEach(item => {
    const ownerId = item.owner_id;
    if (!groupMap[ownerId]) {
      groupMap[ownerId] = {
        agentId: ownerId,
        agentName: item.ownerName || 'Unknown Agent',
        agentEmail: item.ownerEmail || '',
        items: []
      };
    }
    groupMap[ownerId].items.push(item);
  });

  // Convert to array and sort
  const groups = Object.values(groupMap);

  // Sort: current user first, then alphabetically by name
  groups.sort((a, b) => {
    // Current user always first
    if (a.agentId === currentUserId) return -1;
    if (b.agentId === currentUserId) return 1;
    // Then alphabetically
    return a.agentName.localeCompare(b.agentName);
  });

  return groups;
};

export default CollapsibleAgentSection;
