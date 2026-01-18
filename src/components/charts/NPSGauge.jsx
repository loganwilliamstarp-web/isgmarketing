// src/components/charts/NPSGauge.jsx
// NPS Gauge component - semi-circular gauge showing NPS score

import React from 'react';
import { npsService } from '../../services/nps';

/**
 * NPS Gauge Component
 * Displays NPS score as a semi-circular gauge from -100 to +100
 * @param {Object} props
 * @param {number} props.score - NPS score (-100 to +100)
 * @param {number} props.size - Size in pixels (default: 200)
 * @param {boolean} props.showLabel - Show score label (default: true)
 */
export function NPSGauge({
  score = 0,
  size = 200,
  showLabel = true,
  theme = {}
}) {
  const {
    textColor = '#1f2937',
    bgColor = '#e5e7eb'
  } = theme;

  // Clamp score to valid range
  const clampedScore = Math.max(-100, Math.min(100, score));

  // Calculate the angle (0 = -100, 180 = +100)
  const angle = ((clampedScore + 100) / 200) * 180;

  // SVG dimensions
  const strokeWidth = size * 0.12;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arc path for background (full semi-circle)
  const bgArc = describeArc(cx, cy, radius, 180, 360);

  // Calculate color zones (for the gradient background)
  const redZone = describeArc(cx, cy, radius, 180, 225);    // -100 to -50
  const orangeZone = describeArc(cx, cy, radius, 225, 270); // -50 to 0
  const yellowZone = describeArc(cx, cy, radius, 270, 297); // 0 to 30
  const greenZone = describeArc(cx, cy, radius, 297, 333);  // 30 to 70
  const emeraldZone = describeArc(cx, cy, radius, 333, 360); // 70 to 100

  // Needle angle (from center, rotating from left to right)
  const needleAngle = 180 + angle;
  const needleLength = radius - 10;

  // Get color and label for current score
  const scoreColor = npsService.getNPSColor(clampedScore);
  const scoreLabel = npsService.getNPSLabel(clampedScore);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }}>
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Background zones */}
        <path d={redZone} fill="none" stroke="#fee2e2" strokeWidth={strokeWidth} strokeLinecap="butt" />
        <path d={orangeZone} fill="none" stroke="#fef3c7" strokeWidth={strokeWidth} strokeLinecap="butt" />
        <path d={yellowZone} fill="none" stroke="#fef9c3" strokeWidth={strokeWidth} strokeLinecap="butt" />
        <path d={greenZone} fill="none" stroke="#dcfce7" strokeWidth={strokeWidth} strokeLinecap="butt" />
        <path d={emeraldZone} fill="none" stroke="#d1fae5" strokeWidth={strokeWidth} strokeLinecap="butt" />

        {/* Colored overlay for current position */}
        <path
          d={describeArc(cx, cy, radius, 180, 180 + angle)}
          fill="none"
          stroke={scoreColor}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />

        {/* Needle */}
        <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - needleLength}
            stroke={textColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={8} fill={textColor} />
        </g>

        {/* Min/Max labels */}
        <text
          x={strokeWidth / 2}
          y={cy + 20}
          fill={textColor}
          fontSize={12}
          textAnchor="start"
        >
          -100
        </text>
        <text
          x={size - strokeWidth / 2}
          y={cy + 20}
          fill={textColor}
          fontSize={12}
          textAnchor="end"
        >
          +100
        </text>
      </svg>

      {/* Score display */}
      {showLabel && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: size * 0.2,
            fontWeight: 700,
            color: scoreColor
          }}>
            {clampedScore >= 0 ? '+' : ''}{Math.round(clampedScore)}
          </div>
          <div style={{
            fontSize: size * 0.08,
            color: textColor,
            opacity: 0.7
          }}>
            {scoreLabel}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to create SVG arc path
function describeArc(x, y, radius, startAngle, endAngle) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

export default NPSGauge;
