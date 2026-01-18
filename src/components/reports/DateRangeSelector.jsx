// src/components/reports/DateRangeSelector.jsx
// Date range selector with preset options

import React, { useState, useRef, useEffect } from 'react';

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This Month', key: 'thisMonth' },
  { label: 'This Quarter', key: 'thisQuarter' }
];

/**
 * Date Range Selector Component
 * @param {Object} props
 * @param {Object} props.value - { days, startDate, endDate, label }
 * @param {Function} props.onChange - Called with new value
 */
export function DateRangeSelector({ value = { days: 30 }, onChange, theme = {} }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const {
    bgCard = '#ffffff',
    bg = '#f9fafb',
    border = '#e5e7eb',
    text = '#1f2937',
    textSecondary = '#6b7280',
    primary = '#3b82f6'
  } = theme;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (preset) => {
    let newValue;

    if (preset.days) {
      newValue = { days: preset.days, label: preset.label };
    } else if (preset.key === 'thisMonth') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      newValue = {
        startDate: startOfMonth.toISOString(),
        endDate: now.toISOString(),
        days: Math.ceil((now - startOfMonth) / (1000 * 60 * 60 * 24)),
        label: preset.label
      };
    } else if (preset.key === 'thisQuarter') {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const startOfQuarter = new Date(now.getFullYear(), quarter * 3, 1);
      newValue = {
        startDate: startOfQuarter.toISOString(),
        endDate: now.toISOString(),
        days: Math.ceil((now - startOfQuarter) / (1000 * 60 * 60 * 24)),
        label: preset.label
      };
    }

    onChange(newValue);
    setIsOpen(false);
  };

  const currentLabel = value.label || `Last ${value.days} days`;

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: bgCard,
          border: `1px solid ${border}`,
          borderRadius: 8,
          color: text,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {currentLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          backgroundColor: bgCard,
          border: `1px solid ${border}`,
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 100,
          minWidth: 160,
          overflow: 'hidden'
        }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleSelect(preset)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                backgroundColor: value.label === preset.label ? bg : 'transparent',
                border: 'none',
                color: value.label === preset.label ? primary : text,
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = bg}
              onMouseLeave={(e) => e.target.style.backgroundColor = value.label === preset.label ? bg : 'transparent'}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DateRangeSelector;
