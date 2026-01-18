// src/components/charts/AreaChart.jsx
// Reusable area chart component using Recharts

import React from 'react';
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

/**
 * Reusable Area Chart component
 * @param {Object} props
 * @param {Array} props.data - Array of data points
 * @param {Array} props.areas - Array of { key, color, name } for each area
 * @param {string} props.xKey - Key for X-axis data (default: 'date')
 * @param {number} props.height - Chart height (default: 300)
 * @param {boolean} props.stacked - Stack areas (default: false)
 * @param {boolean} props.showLegend - Show legend (default: true)
 */
export function AreaChart({
  data = [],
  areas = [],
  xKey = 'date',
  height = 300,
  stacked = false,
  showLegend = true,
  theme = {}
}) {
  const {
    textColor = '#6b7280',
    gridColor = '#e5e7eb'
  } = theme;

  if (!data || data.length === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: textColor
      }}>
        No data available
      </div>
    );
  }

  const formatXAxis = (value) => {
    if (!value) return '';
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      const date = new Date(value);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return value;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatXAxis}
          stroke={textColor}
          tick={{ fill: textColor, fontSize: 12 }}
        />
        <YAxis
          stroke={textColor}
          tick={{ fill: textColor, fontSize: 12 }}
        />
        <Tooltip
          labelFormatter={(label) => formatXAxis(label)}
          contentStyle={{
            backgroundColor: theme.tooltipBg || '#fff',
            border: `1px solid ${gridColor}`,
            borderRadius: 4
          }}
        />
        {showLegend && <Legend wrapperStyle={{ paddingTop: 10 }} />}
        {areas.map((area, index) => (
          <Area
            key={area.key}
            type="monotone"
            dataKey={area.key}
            name={area.name || area.key}
            stackId={stacked ? 'stack' : undefined}
            stroke={area.color || `hsl(${index * 60}, 70%, 50%)`}
            fill={area.color || `hsl(${index * 60}, 70%, 50%)`}
            fillOpacity={0.3}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}

export default AreaChart;
