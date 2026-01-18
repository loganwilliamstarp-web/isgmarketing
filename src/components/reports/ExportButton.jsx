// src/components/reports/ExportButton.jsx
// Button to export report data as CSV

import React, { useState, useRef, useEffect } from 'react';

/**
 * Export Button Component
 * @param {Object} props
 * @param {Function} props.onExport - Called with { reportType: 'email'|'nps'|'all' }
 * @param {boolean} props.isExporting - Loading state
 */
export function ExportButton({ onExport, isExporting = false, theme = {} }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const {
    bgCard = '#ffffff',
    bg = '#f9fafb',
    border = '#e5e7eb',
    text = '#1f2937',
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

  const handleExport = (reportType) => {
    onExport({ reportType });
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: primary,
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
          cursor: isExporting ? 'not-allowed' : 'pointer',
          opacity: isExporting ? 0.7 : 1
        }}
      >
        {isExporting ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20"/>
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </>
        )}
      </button>

      {isOpen && !isExporting && (
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
          minWidth: 180,
          overflow: 'hidden'
        }}>
          <button
            onClick={() => handleExport('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              color: text,
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = bg}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Full Report (CSV)
          </button>
          <button
            onClick={() => handleExport('email')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              color: text,
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = bg}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Email Report Only
          </button>
          <button
            onClick={() => handleExport('nps')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              color: text,
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = bg}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            NPS Report Only
          </button>
        </div>
      )}
    </div>
  );
}

export default ExportButton;
