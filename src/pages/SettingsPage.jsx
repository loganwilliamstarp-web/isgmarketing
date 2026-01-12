import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useUserSettings, useUserSettingsMutations } from '../hooks';
import { useAuth } from '../contexts/AuthContext';
import { useEffectiveOwner } from '../hooks/useEffectiveOwner';
import { senderDomainsService } from '../services';
import SenderDomainsManager from '../components/settings/SenderDomainsManager';
import SignatureEditor from '../components/settings/SignatureEditor';
import IntegrationsTab from '../components/settings/IntegrationsTab';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Form input component
const FormInput = ({ label, value, onChange, placeholder, type = 'text', disabled, hint, theme: t }) => (
  <div style={{ marginBottom: '16px' }}>
    <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
      {label}
    </label>
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px',
        backgroundColor: disabled ? t.bgHover : t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: '8px',
        color: t.text,
        fontSize: '14px',
        opacity: disabled ? 0.6 : 1
      }}
    />
    {hint && (
      <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>{hint}</p>
    )}
  </div>
);

// Form textarea component
const FormTextarea = ({ label, value, onChange, placeholder, rows = 3, disabled, theme: t }) => (
  <div style={{ marginBottom: '16px' }}>
    <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
      {label}
    </label>
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px',
        backgroundColor: disabled ? t.bgHover : t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: '8px',
        color: t.text,
        fontSize: '14px',
        resize: 'vertical',
        opacity: disabled ? 0.6 : 1
      }}
    />
  </div>
);

// Main Settings Page Component
const SettingsPage = ({ t }) => {
  const { userId } = useParams();
  const [activeTab, setActiveTab] = useState('signature');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [verifiedDomains, setVerifiedDomains] = useState([]);
  const [emailValidationError, setEmailValidationError] = useState(null);

  // Get auth context for role checking
  const { isAdmin, isAgencyAdmin, user } = useAuth();
  const canEditAgencyInfo = isAdmin || isAgencyAdmin;

  // Get effective owner for domain lookup
  const { ownerId } = useEffectiveOwner();

  // Fetch user settings
  const { data: settings, isLoading, error } = useUserSettings();
  const { updateSettings, updateSignature, updateAgencyInfoByProfile } = useUserSettingsMutations();

  // Fetch verified domains on mount
  useEffect(() => {
    const fetchVerifiedDomains = async () => {
      if (!ownerId) return;
      try {
        const domains = await senderDomainsService.getVerifiedDomains(ownerId);
        setVerifiedDomains(domains);
      } catch (err) {
        console.error('Failed to fetch verified domains:', err);
      }
    };
    fetchVerifiedDomains();
  }, [ownerId]);

  // Get the primary verified domain (first one, or user's email domain if it matches)
  const primaryDomain = useMemo(() => {
    if (verifiedDomains.length === 0) return null;
    // Return the first verified domain
    return verifiedDomains[0];
  }, [verifiedDomains]);

  // Local form state
  const [formData, setFormData] = useState({
    full_name: '',
    job_title: '',
    phone: '',
    email: '',
    custom_message: '',
    signature_html: '',
    // Agency info
    agency_name: '',
    agency_address: '',
    agency_phone: '',
    agency_website: '',
    // Email settings
    default_from_name: '',
    default_from_email: '',
    reply_to_email: '',
    sending_domain: ''
  });

  // Initialize form with loaded settings
  // Use a key based on settings to ensure this runs when settings data changes
  useEffect(() => {
    if (settings) {
      // Debug: log settings to verify agency info is loaded
      console.log('SettingsPage: Initializing form with settings:', {
        agency_name: settings.agency_name,
        agency_address: settings.agency_address,
        agency_phone: settings.agency_phone,
        agency_website: settings.agency_website
      });

      // Determine default from email - use saved value, or construct from user email and verified domain
      let defaultFromEmail = settings.default_from_email || '';

      // If no saved from email, auto-populate based on user's email and verified domain
      if (!defaultFromEmail && user?.email && primaryDomain) {
        // Use the user's email username with the verified domain
        const emailUsername = user.email.split('@')[0];
        defaultFromEmail = `${emailUsername}@${primaryDomain.domain}`;
      } else if (!defaultFromEmail && primaryDomain?.default_from_email) {
        // Fall back to domain's default from email
        defaultFromEmail = primaryDomain.default_from_email;
      }

      // Determine default from name - use saved value or user's name
      let defaultFromName = settings.default_from_name || '';
      if (!defaultFromName && user?.name) {
        defaultFromName = user.name;
      } else if (!defaultFromName && primaryDomain?.default_from_name) {
        defaultFromName = primaryDomain.default_from_name;
      }

      setFormData({
        full_name: settings.full_name || '',
        job_title: settings.job_title || '',
        phone: settings.phone || '',
        email: settings.email || '',
        custom_message: settings.custom_message || '',
        signature_html: settings.signature_html || '',
        agency_name: settings.agency_name || '',
        agency_address: settings.agency_address || '',
        agency_phone: settings.agency_phone || '',
        agency_website: settings.agency_website || '',
        default_from_name: defaultFromName,
        default_from_email: defaultFromEmail,
        reply_to_email: settings.reply_to_email || user?.email || '',
        sending_domain: primaryDomain?.domain || settings.sending_domain || ''
      });
    }
  }, [settings, primaryDomain, user]);

  // Handle form field changes
  const handleChange = (field) => (value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSaveMessage(null);

    // Validate email domain when default_from_email changes
    if (field === 'default_from_email' && primaryDomain) {
      const emailDomain = value.split('@')[1]?.toLowerCase();
      if (emailDomain && emailDomain !== primaryDomain.domain.toLowerCase()) {
        setEmailValidationError(`Email must use your verified domain: @${primaryDomain.domain}`);
      } else {
        setEmailValidationError(null);
      }
    }
  };

  // Save signature settings
  const handleSaveSignature = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateSignature.mutateAsync({
        signature_html: formData.signature_html
      });
      setSaveMessage({ type: 'success', text: 'Signature saved successfully!' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to save signature. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Save email settings (only email-related fields)
  const handleSaveEmailSettings = async () => {
    // Validate email domain before saving
    if (primaryDomain && formData.default_from_email) {
      const emailDomain = formData.default_from_email.split('@')[1]?.toLowerCase();
      if (emailDomain && emailDomain !== primaryDomain.domain.toLowerCase()) {
        setEmailValidationError(`Email must use your verified domain: @${primaryDomain.domain}`);
        setSaveMessage({ type: 'error', text: 'Please fix the email domain before saving.' });
        return;
      }
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      // Only send email-related fields to avoid column mismatch errors
      // sending_domain is auto-populated from verified domain
      const emailSettings = {
        sending_domain: primaryDomain?.domain || formData.sending_domain,
        default_from_name: formData.default_from_name,
        default_from_email: formData.default_from_email,
        reply_to_email: formData.reply_to_email
      };
      await updateSettings.mutateAsync(emailSettings);
      setSaveMessage({ type: 'success', text: 'Email settings saved successfully!' });
    } catch (err) {
      console.error('Failed to save email settings:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Build tabs based on user permissions
  const tabs = [
    { id: 'signature', label: 'Email Signature', icon: '👤' },
    // Only show Agency Info tab to admins and agency admins
    ...(canEditAgencyInfo ? [{ id: 'agency', label: 'Agency Info', icon: '🏢' }] : []),
    { id: 'domains', label: 'Sender Domains', icon: '@' },
    { id: 'email', label: 'Email Settings', icon: '📧' },
    { id: 'integrations', label: 'Integrations', icon: '🔗' }
  ];

  // Save agency info for all users in the profile
  const handleSaveAgencyInfo = async () => {
    if (!user?.profileName) {
      setSaveMessage({ type: 'error', text: 'Unable to determine your agency. Please contact support.' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateAgencyInfoByProfile.mutateAsync({
        profileName: user.profileName,
        agencyInfo: {
          agency_name: formData.agency_name,
          agency_address: formData.agency_address,
          agency_phone: formData.agency_phone,
          agency_website: formData.agency_website
        }
      });
      setSaveMessage({ type: 'success', text: 'Agency info saved for all users in your agency!' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to save agency info. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
          Settings
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
          Manage your email preferences and configuration
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.danger}15`,
          border: `1px solid ${t.danger}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.danger,
          fontSize: '14px'
        }}>
          Failed to load settings. Please try refreshing the page.
        </div>
      )}

      {/* Save message */}
      {saveMessage && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: saveMessage.type === 'success' ? `${t.success}15` : `${t.danger}15`,
          border: `1px solid ${saveMessage.type === 'success' ? t.success : t.danger}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: saveMessage.type === 'success' ? t.success : t.danger,
          fontSize: '14px'
        }}>
          {saveMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '24px',
        backgroundColor: t.bgHover,
        padding: '4px',
        borderRadius: '10px',
        width: 'fit-content'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab.id ? t.bgCard : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: activeTab === tab.id ? t.text : t.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div style={{
          padding: '24px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <Skeleton width="200px" height="24px" />
          <div style={{ marginTop: '24px' }}>
            <Skeleton height="40px" />
          </div>
          <div style={{ marginTop: '16px' }}>
            <Skeleton height="40px" />
          </div>
        </div>
      ) : (
        <>
          {/* Signature Tab */}
          {activeTab === 'signature' && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                Your Email Signature
              </h3>
              <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '24px' }}>
                Design your signature using the editor below. Format text, add links, and customize colors.
              </p>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '8px' }}>
                  Signature Editor
                </label>
                <SignatureEditor
                  value={formData.signature_html}
                  onChange={handleChange('signature_html')}
                  theme={t}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '8px' }}>
                  Preview (how it will appear in emails)
                </label>
                <div style={{
                  padding: '16px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: `1px solid ${t.border}`,
                  minHeight: '100px'
                }}>
                  {formData.signature_html ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: formData.signature_html }}
                      style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#333' }}
                    />
                  ) : (
                    <div style={{ color: t.textMuted, fontSize: '14px' }}>
                      Start typing in the editor above to see your signature preview
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleSaveSignature}
                disabled={isSaving}
                style={{
                  padding: '12px 24px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: isSaving ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? 'Saving...' : 'Save Signature'}
              </button>
            </div>
          )}

          {/* Agency Info Tab - Only visible to admins and agency admins */}
          {activeTab === 'agency' && canEditAgencyInfo && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                    Agency Information
                  </h3>
                  <p style={{ fontSize: '13px', color: t.textSecondary, margin: 0 }}>
                    These details are used in email templates and footers for all users in your agency
                  </p>
                </div>
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: t.bgHover,
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: t.textSecondary
                }}>
                  Agency Admin
                </span>
              </div>

              <div style={{
                padding: '12px 16px',
                backgroundColor: `${t.primary}10`,
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '13px',
                color: t.text
              }}>
                Changes saved here will apply to all users in your agency ({user?.profileName || 'your agency'}).
              </div>

              <FormInput
                label="Agency Name"
                value={formData.agency_name}
                onChange={handleChange('agency_name')}
                placeholder="Insurance Solutions Group"
                theme={t}
              />
              <FormInput
                label="Address"
                value={formData.agency_address}
                onChange={handleChange('agency_address')}
                placeholder="123 Main Street, Suite 100, Dallas, TX 75201"
                theme={t}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormInput
                  label="Phone"
                  value={formData.agency_phone}
                  onChange={handleChange('agency_phone')}
                  placeholder="(555) 000-0000"
                  theme={t}
                />
                <FormInput
                  label="Website"
                  value={formData.agency_website}
                  onChange={handleChange('agency_website')}
                  placeholder="https://www.example.com"
                  theme={t}
                />
              </div>

              <button
                onClick={handleSaveAgencyInfo}
                disabled={isSaving}
                style={{
                  padding: '12px 24px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: isSaving ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? 'Saving...' : 'Save Agency Info'}
              </button>
            </div>
          )}

          {/* Sender Domains Tab */}
          {activeTab === 'domains' && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <SenderDomainsManager theme={t} />
            </div>
          )}

          {/* Email Settings Tab */}
          {activeTab === 'email' && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                  Email Configuration
                </h3>
                <p style={{ fontSize: '13px', color: t.textSecondary }}>
                  Configure your default sender information for outgoing emails
                </p>
              </div>

              {/* Verified Domain Display */}
              {primaryDomain ? (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: `${t.success}10`,
                  borderRadius: '8px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <span style={{
                    padding: '4px 8px',
                    backgroundColor: `${t.success}20`,
                    color: t.success,
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}>
                    Verified
                  </span>
                  <span style={{ fontSize: '14px', color: t.text }}>
                    Sending domain: <strong>{primaryDomain.domain}</strong>
                  </span>
                </div>
              ) : (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: `${t.warning}10`,
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: t.warning
                }}>
                  No verified sending domain found. Go to <strong>Sender Domains</strong> to add and verify your domain first.
                </div>
              )}

              <FormInput
                label="Default From Name"
                value={formData.default_from_name}
                onChange={handleChange('default_from_name')}
                placeholder="Your Name or Company"
                hint="The name that will appear as the sender in recipient inboxes"
                theme={t}
              />

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                  Default From Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={formData.default_from_email}
                    onChange={(e) => handleChange('default_from_email')(e.target.value)}
                    placeholder={primaryDomain ? `yourname@${primaryDomain.domain}` : 'noreply@yourdomain.com'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: t.bgInput,
                      border: `1px solid ${emailValidationError ? t.danger : t.border}`,
                      borderRadius: '8px',
                      color: t.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
                {emailValidationError ? (
                  <p style={{ fontSize: '11px', color: t.danger, marginTop: '4px' }}>{emailValidationError}</p>
                ) : primaryDomain ? (
                  <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '4px' }}>
                    Must end with @{primaryDomain.domain}
                  </p>
                ) : null}
              </div>

              <FormInput
                label="Reply-To Email"
                value={formData.reply_to_email}
                onChange={handleChange('reply_to_email')}
                placeholder="support@yourcompany.com"
                type="email"
                hint="Where replies will be directed when recipients respond"
                theme={t}
              />

              <button
                onClick={handleSaveEmailSettings}
                disabled={isSaving || !!emailValidationError || !primaryDomain}
                style={{
                  padding: '12px 24px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: (isSaving || !!emailValidationError || !primaryDomain) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: (isSaving || !!emailValidationError || !primaryDomain) ? 0.7 : 1
                }}
              >
                {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <IntegrationsTab userId={ownerId} theme={t} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingsPage;
