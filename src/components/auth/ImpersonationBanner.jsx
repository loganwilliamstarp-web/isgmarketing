// src/components/auth/ImpersonationBanner.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { senderDomainsService } from '../../services';
import { supabase } from '../../lib/supabase';

const ImpersonationBanner = () => {
  const navigate = useNavigate();
  const { impersonating, exitImpersonation, user } = useAuth();
  const [domainWarning, setDomainWarning] = useState(null);

  // Check domain verification status for impersonated user
  useEffect(() => {
    if (!impersonating.active || !impersonating.targetUserId) {
      setDomainWarning(null);
      return;
    }

    const checkDomainVerification = async () => {
      try {
        // Get impersonated user's email (for display purposes)
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('email')
          .eq('user_unique_id', impersonating.targetUserId)
          .limit(1)
          .single();

        if (userError || !userData?.email) {
          setDomainWarning(null);
          return;
        }

        // Extract domain from email
        const emailDomain = userData.email.split('@')[1]?.toLowerCase();
        if (!emailDomain) {
          setDomainWarning(null);
          return;
        }

        // Get verified sender domains via edge function (bypasses RLS)
        const domains = await senderDomainsService.getVerifiedDomains(impersonating.targetUserId);

        // Check if any verified domain was found matching the user's email domain
        const hasMatchingDomain = domains && domains.length > 0;

        if (!hasMatchingDomain) {
          setDomainWarning({
            email: userData.email,
            domain: emailDomain,
            hasAnyVerifiedDomain: false
          });
        } else {
          setDomainWarning(null);
        }
      } catch (error) {
        console.error('Error checking domain verification:', error);
        setDomainWarning(null);
      }
    };

    checkDomainVerification();
  }, [impersonating.active, impersonating.targetUserId]);

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

  const handleGoToSettings = () => {
    navigate(`/${impersonating.targetUserId}/settings`);
  };

  return (
    <>
      {/* Main impersonation banner */}
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

      {/* Domain verification warning banner */}
      {domainWarning && (
        <div style={{
          backgroundColor: '#dc2626',
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
          top: '44px',
          left: 0,
          right: 0,
          zIndex: 9998,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            {domainWarning.hasAnyVerifiedDomain ? (
              <>
                No verified sender domain matching <strong>{domainWarning.domain}</strong>
              </>
            ) : (
              <>
                No verified sender domain for <strong>{domainWarning.domain}</strong>
              </>
            )}
          </span>
          <button
            onClick={handleGoToSettings}
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
            Add Domain
          </button>
        </div>
      )}
    </>
  );
};

export default ImpersonationBanner;
