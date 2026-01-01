// src/components/settings/SenderDomainsManager.jsx
// UI component for agency admins to manage their sender domains
// Allows adding domains, viewing DNS records, and verifying domain ownership

import React, { useState, useEffect } from 'react';
import { senderDomainsService } from '../../services';

// Status badge component
const StatusBadge = ({ status, theme: t }) => {
  const statusConfig = {
    verified: { bg: `${t.success}20`, color: t.success, label: 'Verified' },
    pending: { bg: `${t.warning}20`, color: t.warning, label: 'Pending DNS' },
    failed: { bg: `${t.danger}20`, color: t.danger, label: 'Failed' }
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span style={{
      padding: '4px 10px',
      backgroundColor: config.bg,
      color: config.color,
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '500'
    }}>
      {config.label}
    </span>
  );
};

// DNS Record display component
const DnsRecord = ({ record, theme: t }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      padding: '12px',
      backgroundColor: t.bg,
      borderRadius: '8px',
      marginBottom: '8px',
      border: `1px solid ${record.valid ? t.success : t.border}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{
          fontSize: '11px',
          fontWeight: '600',
          color: t.textSecondary,
          textTransform: 'uppercase'
        }}>
          {record.type} Record
        </span>
        {record.valid ? (
          <span style={{ color: t.success, fontSize: '12px' }}>Valid</span>
        ) : (
          <span style={{ color: t.warning, fontSize: '12px' }}>Not verified</span>
        )}
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '2px' }}>Host / Name:</div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: t.bgCard,
          padding: '8px 12px',
          borderRadius: '6px'
        }}>
          <code style={{ fontSize: '12px', color: t.text, flex: 1, wordBreak: 'break-all' }}>
            {record.host}
          </code>
          <button
            onClick={() => copyToClipboard(record.host)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '4px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '2px' }}>Value / Points to:</div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: t.bgCard,
          padding: '8px 12px',
          borderRadius: '6px'
        }}>
          <code style={{ fontSize: '12px', color: t.text, flex: 1, wordBreak: 'break-all' }}>
            {record.data}
          </code>
          <button
            onClick={() => copyToClipboard(record.data)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '4px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Copy
          </button>
        </div>
      </div>

      {record.reason && !record.valid && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: `${t.warning}10`,
          borderRadius: '4px',
          fontSize: '11px',
          color: t.warning
        }}>
          {record.reason}
        </div>
      )}
    </div>
  );
};

// Add Domain Modal
const AddDomainModal = ({ isOpen, onClose, onAdd, theme: t }) => {
  const [domain, setDomain] = useState('');
  const [subdomain, setSubdomain] = useState('mail');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Subdomain is required by SendGrid - default to 'mail' if empty
      await onAdd(domain, { subdomain: subdomain.trim() || 'mail' });
      setDomain('');
      setSubdomain('mail');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        padding: '24px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
          Add Sender Domain
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="youragency.com"
              required
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
            <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
              Enter your agency's domain (without www or https)
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Subdomain Prefix
            </label>
            <input
              type="text"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="mail"
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
            <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
              Creates {subdomain || 'mail'}.{domain || 'youragency.com'} for email sending (required by SendGrid)
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px',
              backgroundColor: `${t.danger}15`,
              border: `1px solid ${t.danger}30`,
              borderRadius: '8px',
              marginBottom: '16px',
              color: t.danger,
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !domain}
              style={{
                padding: '10px 20px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: isLoading ? 'wait' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: isLoading || !domain ? 0.7 : 1
              }}
            >
              {isLoading ? 'Adding...' : 'Add Domain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Domain Details Panel
const DomainDetailsPanel = ({ domain, onVerify, onDelete, isVerifying, theme: t }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dnsRecords = domain.dns_records || {};

  return (
    <div style={{
      padding: '20px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      marginTop: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
            {domain.domain}
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <StatusBadge status={domain.status} theme={t} />
            {domain.verified_at && (
              <span style={{ fontSize: '12px', color: t.textMuted }}>
                Verified {new Date(domain.verified_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {domain.status !== 'verified' && (
            <button
              onClick={() => onVerify(domain.id)}
              disabled={isVerifying}
              style={{
                padding: '8px 16px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: isVerifying ? 'wait' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                opacity: isVerifying ? 0.7 : 1
              }}
            >
              {isVerifying ? 'Verifying...' : 'Verify DNS'}
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.danger}`,
              borderRadius: '6px',
              color: t.danger,
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Instructions */}
      {domain.status !== 'verified' && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.primary}10`,
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '500', color: t.text, marginBottom: '8px' }}>
            Setup Instructions
          </div>
          <ol style={{ margin: 0, paddingLeft: '20px', color: t.textSecondary, fontSize: '13px', lineHeight: '1.6' }}>
            <li>Log in to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</li>
            <li>Navigate to DNS settings for <strong>{domain.domain}</strong></li>
            <li>Add the CNAME records shown below</li>
            <li>Wait 5-10 minutes for DNS propagation</li>
            <li>Click "Verify DNS" to confirm setup</li>
          </ol>
        </div>
      )}

      {/* DNS Records */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '500', color: t.text, marginBottom: '12px' }}>
          Required DNS Records
        </div>

        {dnsRecords.mail_cname && (
          <DnsRecord record={{ ...dnsRecords.mail_cname, type: 'CNAME' }} theme={t} />
        )}
        {dnsRecords.dkim1 && (
          <DnsRecord record={{ ...dnsRecords.dkim1, type: 'CNAME' }} theme={t} />
        )}
        {dnsRecords.dkim2 && (
          <DnsRecord record={{ ...dnsRecords.dkim2, type: 'CNAME' }} theme={t} />
        )}

        {!dnsRecords.mail_cname && !dnsRecords.dkim1 && !dnsRecords.dkim2 && (
          <div style={{ color: t.textMuted, fontSize: '13px', fontStyle: 'italic' }}>
            DNS records will appear here after domain is added
          </div>
        )}
      </div>

      {/* Default sender settings */}
      {domain.status === 'verified' && (
        <div style={{
          padding: '16px',
          backgroundColor: t.bg,
          borderRadius: '8px',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: t.text, marginBottom: '8px' }}>
            Default Sender Settings
          </div>
          <div style={{ fontSize: '13px', color: t.textSecondary }}>
            <div>From Email: <strong>{domain.default_from_email || `noreply@${domain.domain}`}</strong></div>
            {domain.default_from_name && (
              <div>From Name: <strong>{domain.default_from_name}</strong></div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '12px' }}>
              Remove Domain?
            </h4>
            <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '20px' }}>
              This will remove <strong>{domain.domain}</strong> from your account. You won't be able to send emails from this domain.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(domain.id);
                  setShowDeleteConfirm(false);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: t.danger,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Remove Domain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main Component
const SenderDomainsManager = ({ theme: t }) => {
  const [domains, setDomains] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState(null);
  const [verifyingDomainId, setVerifyingDomainId] = useState(null);

  // Load domains
  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await senderDomainsService.getAll();
      setDomains(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDomain = async (domain, options) => {
    const newDomain = await senderDomainsService.addDomain(domain, options);
    setDomains(prev => [newDomain, ...prev]);
    setSelectedDomainId(newDomain.id);
  };

  const handleVerifyDomain = async (domainId) => {
    setVerifyingDomainId(domainId);
    try {
      const result = await senderDomainsService.verifyDomain(domainId);
      setDomains(prev => prev.map(d => d.id === domainId ? result.domain : d));

      if (result.valid) {
        // Show success message
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handleDeleteDomain = async (domainId) => {
    try {
      await senderDomainsService.deleteDomain(domainId);
      setDomains(prev => prev.filter(d => d.id !== domainId));
      if (selectedDomainId === domainId) {
        setSelectedDomainId(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedDomain = domains.find(d => d.id === selectedDomainId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
            Sender Domains
          </h3>
          <p style={{ fontSize: '13px', color: t.textSecondary }}>
            Configure your agency's sending domains for email delivery
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: t.primary,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          + Add Domain
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: `${t.danger}15`,
          border: `1px solid ${t.danger}30`,
          borderRadius: '8px',
          marginBottom: '16px',
          color: t.danger,
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: t.danger,
              cursor: 'pointer',
              fontSize: '18px'
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: t.textSecondary
        }}>
          Loading domains...
        </div>
      ) : domains.length === 0 ? (
        /* Empty state */
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: t.bg,
          borderRadius: '12px',
          border: `1px dashed ${t.border}`
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>@</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: t.text, marginBottom: '8px' }}>
            No sender domains configured
          </div>
          <div style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '20px' }}>
            Add your agency's domain to start sending emails from your own address
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Add Your First Domain
          </button>
        </div>
      ) : (
        /* Domain list */
        <>
          <div style={{
            backgroundColor: t.bg,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            overflow: 'hidden'
          }}>
            {domains.map((domain, index) => (
              <div
                key={domain.id}
                onClick={() => setSelectedDomainId(selectedDomainId === domain.id ? null : domain.id)}
                style={{
                  padding: '16px 20px',
                  borderBottom: index < domains.length - 1 ? `1px solid ${t.border}` : 'none',
                  cursor: 'pointer',
                  backgroundColor: selectedDomainId === domain.id ? t.bgHover : 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: domain.status === 'verified' ? `${t.success}20` : `${t.warning}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px'
                  }}>
                    {domain.status === 'verified' ? '@' : '...'}
                  </div>
                  <div>
                    <div style={{ fontWeight: '500', color: t.text }}>{domain.domain}</div>
                    <div style={{ fontSize: '12px', color: t.textMuted }}>
                      {domain.default_from_email || `noreply@${domain.domain}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <StatusBadge status={domain.status} theme={t} />
                  <span style={{
                    color: t.textMuted,
                    fontSize: '18px',
                    transform: selectedDomainId === domain.id ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s'
                  }}>
                    v
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Selected domain details */}
          {selectedDomain && (
            <DomainDetailsPanel
              domain={selectedDomain}
              onVerify={handleVerifyDomain}
              onDelete={handleDeleteDomain}
              isVerifying={verifyingDomainId === selectedDomain.id}
              theme={t}
            />
          )}
        </>
      )}

      {/* Add Domain Modal */}
      <AddDomainModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddDomain}
        theme={t}
      />
    </div>
  );
};

export default SenderDomainsManager;
