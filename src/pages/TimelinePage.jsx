// src/pages/TimelinePage.jsx
import React, { useState, useMemo } from 'react';
import { useLifecycleStages } from '../hooks/useTimeline';
import TimelineCard from '../components/timeline/TimelineCard';

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
  // Filters state
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [lobFilter, setLobFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCards, setExpandedCards] = useState({});

  // Fetch lifecycle stages with automations
  const { data, isLoading, error } = useLifecycleStages();

  // Available categories for filter
  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'Onboarding', label: 'Onboarding' },
    { value: 'Retention', label: 'Retention' },
    { value: 'Cross-Sell', label: 'Cross-Sell' },
    { value: 'Win-Back', label: 'Win-Back' },
    { value: 'Engagement', label: 'Engagement' }
  ];

  // Lines of business for filter
  const linesOfBusiness = [
    { value: 'all', label: 'All Lines' },
    { value: 'Personal', label: 'Personal Lines' },
    { value: 'Commercial', label: 'Commercial Lines' }
  ];

  // Filter and process stages
  const filteredStages = useMemo(() => {
    if (!data?.stages) return [];

    return data.stages
      .map(stage => {
        // Filter automations within each stage
        let automations = stage.automations;

        // Apply category filter
        if (categoryFilter !== 'all') {
          if (stage.name.toLowerCase() !== categoryFilter.toLowerCase()) {
            return null;
          }
        }

        // Apply line of business filter
        if (lobFilter !== 'all') {
          automations = automations.filter(a =>
            a.lineOfBusiness === lobFilter || a.lineOfBusiness === 'All'
          );
        }

        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          automations = automations.filter(a =>
            a.name?.toLowerCase().includes(query) ||
            a.description?.toLowerCase().includes(query) ||
            a.default_key?.toLowerCase().includes(query)
          );
        }

        if (automations.length === 0) return null;

        return { ...stage, automations };
      })
      .filter(Boolean);
  }, [data?.stages, categoryFilter, lobFilter, searchQuery]);

  // Toggle card expansion
  const toggleCard = (automationId) => {
    setExpandedCards(prev => ({
      ...prev,
      [automationId]: !prev[automationId]
    }));
  };

  // Expand all cards
  const expandAll = () => {
    const allIds = {};
    filteredStages.forEach(stage => {
      stage.automations.forEach(a => {
        allIds[a.id] = true;
      });
    });
    setExpandedCards(allIds);
  };

  // Collapse all cards
  const collapseAll = () => {
    setExpandedCards({});
  };

  // Count total automations
  const totalAutomations = useMemo(() => {
    return filteredStages.reduce((sum, stage) => sum + stage.automations.length, 0);
  }, [filteredStages]);

  // Loading state
  if (isLoading) {
    return (
      <div>
        <div style={{ marginBottom: '24px' }}>
          <Skeleton width="300px" height="32px" style={{ marginBottom: '8px' }} />
          <Skeleton width="400px" height="16px" />
        </div>
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <Skeleton width="150px" height="40px" />
          <Skeleton width="150px" height="40px" />
          <Skeleton width="200px" height="40px" />
        </div>
        <div style={{ display: 'grid', gap: '24px' }}>
          {[1, 2, 3].map(i => (
            <div key={i}>
              <Skeleton width="120px" height="24px" style={{ marginBottom: '12px' }} />
              <div style={{ display: 'grid', gap: '12px' }}>
                <Skeleton height="100px" />
                <Skeleton height="100px" />
              </div>
            </div>
          ))}
        </div>
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
          Visualize the customer journey through your master automations and email sequences
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            cursor: 'pointer',
            minWidth: '160px'
          }}
        >
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        {/* Line of Business Filter */}
        <select
          value={lobFilter}
          onChange={(e) => setLobFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            cursor: 'pointer',
            minWidth: '160px'
          }}
        >
          {linesOfBusiness.map(lob => (
            <option key={lob.value} value={lob.value}>{lob.label}</option>
          ))}
        </select>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search automations..."
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px'
            }}
          />
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: t.textMuted
          }}>
            🔍
          </span>
        </div>

        {/* Expand/Collapse buttons */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={expandAll}
            style={{
              padding: '10px 16px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            style={{
              padding: '10px 16px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Results count */}
      <div style={{
        marginBottom: '16px',
        fontSize: '13px',
        color: t.textMuted
      }}>
        Showing {totalAutomations} automation{totalAutomations !== 1 ? 's' : ''} across {filteredStages.length} stage{filteredStages.length !== 1 ? 's' : ''}
      </div>

      {/* Empty state */}
      {filteredStages.length === 0 && (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <h3 style={{ color: t.text, marginBottom: '8px' }}>No automations found</h3>
          <p style={{ color: t.textMuted }}>
            {searchQuery || categoryFilter !== 'all' || lobFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'No master automations have been configured yet'}
          </p>
        </div>
      )}

      {/* Lifecycle Stages */}
      <div style={{ display: 'grid', gap: '32px' }}>
        {filteredStages.map(stage => (
          <div key={stage.name}>
            {/* Stage Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: stage.color
              }} />
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: t.text,
                margin: 0
              }}>
                {stage.name}
              </h2>
              <span style={{
                padding: '2px 8px',
                backgroundColor: `${stage.color}20`,
                color: stage.color,
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                {stage.automations.length}
              </span>
            </div>

            {/* Stage Description */}
            <p style={{
              color: t.textSecondary,
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              {getStageDescription(stage.name)}
            </p>

            {/* Automations Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
              gap: '16px'
            }}>
              {stage.automations.map(automation => (
                <TimelineCard
                  key={automation.id}
                  automation={automation}
                  templates={data?.templates}
                  templateMap={data?.templateMap}
                  t={t}
                  expanded={expandedCards[automation.id]}
                  onToggle={() => toggleCard(automation.id)}
                />
              ))}
            </div>

            {/* Stage Connector */}
            {filteredStages.indexOf(stage) < filteredStages.length - 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 0'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <div style={{
                    width: '2px',
                    height: '20px',
                    backgroundColor: t.border
                  }} />
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: t.bgHover,
                    border: `2px solid ${t.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: t.textMuted
                  }}>
                    ↓
                  </div>
                  <div style={{
                    width: '2px',
                    height: '20px',
                    backgroundColor: t.border
                  }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Get description for each lifecycle stage
function getStageDescription(stageName) {
  const descriptions = {
    'Onboarding': 'Welcome new customers and set expectations for the relationship',
    'Retention': 'Keep customers engaged around policy renewals and important milestones',
    'Cross-Sell': 'Identify opportunities to expand coverage with existing customers',
    'Win-Back': 'Re-engage prospects and prior customers who may be ready to return',
    'Engagement': 'Maintain ongoing communication and build stronger relationships'
  };
  return descriptions[stageName] || 'Automated touchpoints for this stage of the customer journey';
}

export default TimelinePage;
