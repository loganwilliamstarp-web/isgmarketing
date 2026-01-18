// src/components/charts/NPSBreakdownBar.jsx
// Horizontal stacked bar showing NPS category breakdown

import React from 'react';

/**
 * NPS Breakdown Bar Component
 * Shows a horizontal stacked bar with promoters/passives/detractors
 * @param {Object} props
 * @param {Object} props.data - { promoters, passives, detractors, total_responses }
 * @param {number} props.height - Bar height (default: 40)
 * @param {boolean} props.showLabels - Show percentage labels (default: true)
 * @param {boolean} props.showLegend - Show legend below (default: true)
 */
export function NPSBreakdownBar({
  data = {},
  height = 40,
  showLabels = true,
  showLegend = true,
  theme = {}
}) {
  const {
    textColor = '#1f2937'
  } = theme;

  const promoters = data.promoters || 0;
  const passives = data.passives || 0;
  const detractors = data.detractors || 0;
  const total = promoters + passives + detractors;

  if (total === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: textColor,
        opacity: 0.6
      }}>
        No survey responses yet
      </div>
    );
  }

  const promoterPct = (promoters / total) * 100;
  const passivePct = (passives / total) * 100;
  const detractorPct = (detractors / total) * 100;

  const segments = [
    { key: 'detractors', label: 'Detractors', value: detractors, pct: detractorPct, color: '#ef4444', stars: '1-2' },
    { key: 'passives', label: 'Passives', value: passives, pct: passivePct, color: '#f59e0b', stars: '3' },
    { key: 'promoters', label: 'Promoters', value: promoters, pct: promoterPct, color: '#22c55e', stars: '4-5' }
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#e5e7eb'
      }}>
        {segments.map(seg => seg.pct > 0 && (
          <div
            key={seg.key}
            style={{
              width: `${seg.pct}%`,
              backgroundColor: seg.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: height > 30 ? 14 : 12,
              minWidth: seg.pct > 5 ? 'auto' : 0,
              transition: 'width 0.3s ease'
            }}
          >
            {showLabels && seg.pct >= 10 && `${Math.round(seg.pct)}%`}
          </div>
        ))}
      </div>

      {/* Legend */}
      {showLegend && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginTop: 12,
          flexWrap: 'wrap'
        }}>
          {segments.map(seg => (
            <div key={seg.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: seg.color
              }} />
              <span style={{ color: textColor, fontSize: 13 }}>
                {seg.label} ({seg.stars} stars): <strong>{seg.value}</strong> ({Math.round(seg.pct)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NPSBreakdownBar;
