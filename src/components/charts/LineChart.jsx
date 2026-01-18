// src/components/charts/LineChart.jsx
// Reusable line chart component using Recharts

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

/**
 * Reusable Line Chart component
 * @param {Object} props
 * @param {Array} props.data - Array of data points
 * @param {Array} props.lines - Array of { key, color, name } for each line
 * @param {string} props.xKey - Key for X-axis data (default: 'date')
 * @param {number} props.height - Chart height (default: 300)
 * @param {boolean} props.showLegend - Show legend (default: true)
 * @param {boolean} props.showGrid - Show grid lines (default: true)
 * @param {string} props.yAxisLabel - Y-axis label
 * @param {Function} props.tooltipFormatter - Custom tooltip formatter
 */
export function LineChart({
  data = [],
  lines = [],
  xKey = 'date',
  height = 300,
  showLegend = true,
  showGrid = true,
  yAxisLabel,
  tooltipFormatter,
  theme = {}
}) {
  const {
    textColor = '#6b7280',
    gridColor = '#e5e7eb',
    backgroundColor = 'transparent'
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
    // If it's a date string, format it
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      const date = new Date(value);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return value;
  };

  const defaultTooltipFormatter = (value, name) => {
    if (typeof value === 'number') {
      return [value.toLocaleString(), name];
    }
    return [value, name];
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        )}
        <XAxis
          dataKey={xKey}
          tickFormatter={formatXAxis}
          stroke={textColor}
          tick={{ fill: textColor, fontSize: 12 }}
        />
        <YAxis
          stroke={textColor}
          tick={{ fill: textColor, fontSize: 12 }}
          label={yAxisLabel ? {
            value: yAxisLabel,
            angle: -90,
            position: 'insideLeft',
            fill: textColor
          } : undefined}
        />
        <Tooltip
          formatter={tooltipFormatter || defaultTooltipFormatter}
          labelFormatter={(label) => formatXAxis(label)}
          contentStyle={{
            backgroundColor: theme.tooltipBg || '#fff',
            border: `1px solid ${gridColor}`,
            borderRadius: 4
          }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ paddingTop: 10 }}
          />
        )}
        {lines.map((line, index) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name || line.key}
            stroke={line.color || `hsl(${index * 60}, 70%, 50%)`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

export default LineChart;
