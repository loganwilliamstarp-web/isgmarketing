// src/components/auth/ImpersonationBanner.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ImpersonationBanner = () => {
  const navigate = useNavigate();
  const { impersonating, exitImpersonation, user } = useAuth();

  if (!impersonating.active) {
    return null;
  }

  const handleExit = () => {
    exitImpersonation();
    // Navigate back to admin's own dashboard
    if (user?.id) {
      navigate(`/${user.id}/dashboard`);
    }
  };

  return (
    <div style={{
      backgroundColor: '#f59e0b',
      color: '#ffffff',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '14px',
      fontWeight: '500',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>👁️</span>
        Viewing as: <strong>{impersonating.targetUserName}</strong>
      </span>
      <button
        onClick={handleExit}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          color: '#ffffff',
          padding: '6px 16px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '600',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
      >
        Exit Impersonation
      </button>
    </div>
  );
};

export default ImpersonationBanner;
