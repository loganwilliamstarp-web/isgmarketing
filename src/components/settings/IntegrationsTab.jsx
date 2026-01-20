// src/components/settings/IntegrationsTab.jsx
// Integrations settings tab with Gmail/Microsoft OAuth for inbox injection
// Each user connects their own email account for reply injection

import React, { useState, useEffect } from 'react';
import { emailOAuthService } from '../../services/emailOAuth';
import { useAuth } from '../../contexts/AuthContext';

const IntegrationsTab = ({ userId, theme: t }) => {
  const { user, impersonating } = useAuth();
  const [connections, setConnections] = useState({ gmail: null, microsoft: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const [error, setError] = useState(null);

  // Users can manage their own connections
  // When impersonating, don't allow managing connections (view only)
  const canManageConnections = !impersonating?.active;

  // Use owner_id for per-user connections
  // When impersonating, use the target user's ID
  // user.id is the Salesforce user_unique_id which maps to owner_id
  const ownerId = impersonating?.active && impersonating?.targetUserId
    ? impersonating.targetUserId
    : user?.id;

  // Check for OAuth callback result in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    const oauthError = params.get('error');

    if (oauthResult === 'success') {
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
      loadConnections();
    } else if (oauthResult === 'error') {
      setError(`OAuth connection failed: ${oauthError || 'Unknown error'}`);
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    }
  }, []);

  useEffect(() => {
    if (ownerId) {
      loadConnections();
    } else {
      setIsLoading(false);
    }
  }, [ownerId]);

  const loadConnections = async () => {
    if (!ownerId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Get connections by owner_id (per-user)
      const data = await emailOAuthService.getConnections(ownerId);
      setConnections(data);
    } catch (err) {
      console.error('[IntegrationsTab] Failed to load connections:', err);
      setError('Failed to load connection status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (provider) => {
    if (!canManageConnections) return;
    if (!ownerId) {
      setError('Unable to determine user. Please contact support.');
      return;
    }

    setIsConnecting(provider);
    setError(null);
    try {
      await emailOAuthService.initiateOAuth(provider, ownerId);
      await loadConnections();
    } catch (err) {
      console.error('[IntegrationsTab] OAuth failed:', err);
      setError(err.message || `Failed to connect ${provider}`);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (provider) => {
    if (!canManageConnections) return;

    setDisconnecting(provider);
    setError(null);
    try {
      await emailOAuthService.disconnect(provider, ownerId);
      setConnections(prev => ({ ...prev, [provider]: null }));
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError(`Failed to disconnect ${provider}`);
    } finally {
      setDisconnecting(null);
    }
  };

  // Show a message if no owner ID is set
  if (!ownerId) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: t.textSecondary
      }}>
        <p>Unable to determine your user account. Email integrations require you to be logged in.</p>
        <p style={{ fontSize: '13px', marginTop: '8px' }}>Please contact support if this issue persists.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Email Inbox Sync Section */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            Email Inbox Sync
          </h3>
        </div>
        <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '16px' }}>
          Connect your email account to receive replies directly in your inbox. When contacts reply to your
          marketing emails, the replies will be delivered to your connected email.
        </p>

        {/* Info banner */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: `${t.primary}10`,
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          color: t.text,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <span style={{ fontSize: '16px' }}>💡</span>
          <div>
            <strong>How it works:</strong> When connected, replies to your marketing emails
            are automatically delivered to your inbox. This allows you to respond naturally while
            the system tracks response rates for campaigns.
          </div>
        </div>

        {/* View-only notice when impersonating */}
        {!canManageConnections && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: `${t.warning}15`,
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            color: t.warning,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '16px' }}>🔒</span>
            <div>
              Connection management is disabled while viewing as another user.
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: `${t.danger}15`,
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            color: t.danger
          }}>
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: t.textSecondary }}>
            Loading connection status...
          </div>
        ) : (
          <>
            {/* Gmail Integration */}
            <IntegrationCard
              provider="gmail"
              name="Gmail"
              icon={<GmailIcon />}
              iconBg="#EA4335"
              description="Connect a Gmail account to receive replies"
              connection={connections.gmail}
              isConnecting={isConnecting === 'gmail'}
              isDisconnecting={disconnecting === 'gmail'}
              onConnect={() => handleConnect('gmail')}
              onDisconnect={() => handleDisconnect('gmail')}
              canManage={canManageConnections}
              theme={t}
            />

            {/* Microsoft Integration */}
            <IntegrationCard
              provider="microsoft"
              name="Microsoft 365"
              icon={<MicrosoftIcon />}
              iconBg="#00A4EF"
              description="Connect an Outlook/Microsoft 365 account to receive replies"
              connection={connections.microsoft}
              isConnecting={isConnecting === 'microsoft'}
              isDisconnecting={disconnecting === 'microsoft'}
              onConnect={() => handleConnect('microsoft')}
              onDisconnect={() => handleDisconnect('microsoft')}
              canManage={canManageConnections}
              theme={t}
            />
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: t.border, margin: '24px 0' }} />

      {/* Other Integrations Section */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
          Platform Integrations
        </h3>

        {/* SendGrid Integration */}
        <div style={{
          padding: '20px',
          backgroundColor: t.bg,
          borderRadius: '10px',
          border: `1px solid ${t.border}`,
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#1A82E2',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '700'
              }}>
                SG
              </div>
              <div>
                <div style={{ fontWeight: '600', color: t.text, marginBottom: '2px' }}>SendGrid</div>
                <div style={{ fontSize: '13px', color: t.textSecondary }}>Email delivery service</div>
              </div>
            </div>
            <span style={{
              padding: '4px 10px',
              backgroundColor: `${t.success}20`,
              color: t.success,
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              Connected
            </span>
          </div>
        </div>

        {/* Salesforce Integration */}
        <div style={{
          padding: '20px',
          backgroundColor: t.bg,
          borderRadius: '10px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#00A1E0',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '700'
              }}>
                SF
              </div>
              <div>
                <div style={{ fontWeight: '600', color: t.text, marginBottom: '2px' }}>Salesforce</div>
                <div style={{ fontSize: '13px', color: t.textSecondary }}>CRM data sync</div>
              </div>
            </div>
            <span style={{
              padding: '4px 10px',
              backgroundColor: `${t.success}20`,
              color: t.success,
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              Connected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Integration card component for Gmail/Microsoft
const IntegrationCard = ({
  provider,
  name,
  icon,
  iconBg,
  description,
  connection,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
  canManage,
  theme: t
}) => {
  const isConnected = connection?.status === 'active';
  const hasError = connection?.status === 'error' || connection?.status === 'expired';

  return (
    <div style={{
      padding: '20px',
      backgroundColor: t.bg,
      borderRadius: '10px',
      border: `1px solid ${hasError ? t.danger : t.border}`,
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: iconBg,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontWeight: '600', color: t.text, marginBottom: '2px' }}>{name}</div>
            <div style={{ fontSize: '13px', color: t.textSecondary }}>
              {isConnected
                ? `Connected as ${connection.email}`
                : description
              }
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isConnected ? (
            <>
              <span style={{
                padding: '4px 10px',
                backgroundColor: `${t.success}20`,
                color: t.success,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                Connected
              </span>
              {canManage && (
                <button
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${t.danger}`,
                    borderRadius: '6px',
                    color: t.danger,
                    cursor: isDisconnecting ? 'wait' : 'pointer',
                    fontSize: '13px',
                    opacity: isDisconnecting ? 0.7 : 1
                  }}
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              )}
            </>
          ) : hasError ? (
            <>
              <span style={{
                padding: '4px 10px',
                backgroundColor: `${t.danger}20`,
                color: t.danger,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                {connection?.status === 'expired' ? 'Expired' : 'Error'}
              </span>
              {canManage && (
                <button
                  onClick={onConnect}
                  disabled={isConnecting}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: t.primary,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: isConnecting ? 'wait' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    opacity: isConnecting ? 0.7 : 1
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Reconnect'}
                </button>
              )}
            </>
          ) : (
            canManage ? (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: isConnecting ? 'wait' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  opacity: isConnecting ? 0.7 : 1
                }}
              >
                {isConnecting ? 'Connecting...' : `Connect ${name}`}
              </button>
            ) : (
              <span style={{
                padding: '4px 10px',
                backgroundColor: t.bgHover,
                color: t.textMuted,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                Not Connected
              </span>
            )
          )}
        </div>
      </div>

      {/* Error message */}
      {hasError && connection?.lastError && (
        <div style={{
          marginTop: '12px',
          padding: '10px',
          backgroundColor: `${t.danger}15`,
          borderRadius: '6px',
          fontSize: '12px',
          color: t.danger
        }}>
          {connection.status === 'expired'
            ? 'Your connection has expired. Please reconnect to continue receiving replies.'
            : `Error: ${connection.lastError}`
          }
        </div>
      )}

      {/* Last used info */}
      {isConnected && connection?.lastUsedAt && (
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: t.textMuted
        }}>
          Last used: {new Date(connection.lastUsedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};

// Gmail icon SVG
const GmailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/>
  </svg>
);

// Microsoft icon SVG
const MicrosoftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11 11H2V2h9v9zm2-9v9h9V2h-9zm9 11h-9v9h9v-9zm-11 0H2v9h9v-9z"/>
  </svg>
);

export default IntegrationsTab;
