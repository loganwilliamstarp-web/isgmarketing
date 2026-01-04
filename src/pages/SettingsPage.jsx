import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useUserSettings, useUserSettingsMutations } from '../hooks';
import SenderDomainsManager from '../components/settings/SenderDomainsManager';
import SignatureEditor from '../components/settings/SignatureEditor';

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

  // Fetch user settings
  const { data: settings, isLoading, error } = useUserSettings();
  const { updateSettings, updateSignature } = useUserSettingsMutations();

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
  useEffect(() => {
    if (settings) {
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
        default_from_name: settings.default_from_name || '',
        default_from_email: settings.default_from_email || '',
        reply_to_email: settings.reply_to_email || '',
        sending_domain: settings.sending_domain || ''
      });
    }
  }, [settings]);

  // Handle form field changes
  const handleChange = (field) => (value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSaveMessage(null);
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

  // Save all settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateSettings.mutateAsync(formData);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'signature', label: 'Email Signature', icon: '👤' },
    { id: 'agency', label: 'Agency Info', icon: '🏢' },
    { id: 'domains', label: 'Sender Domains', icon: '@' },
    { id: 'email', label: 'Email Settings', icon: '📧' },
    { id: 'integrations', label: 'Integrations', icon: '🔗' }
  ];

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

          {/* Agency Info Tab */}
          {activeTab === 'agency' && (
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                Agency Information
              </h3>
              <p style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '24px' }}>
                Your agency details used in email templates and footers
              </p>

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
                onClick={handleSaveSettings}
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
                {isSaving ? '💾 Saving...' : '💾 Save Agency Info'}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                    Email Configuration
                  </h3>
                  <p style={{ fontSize: '13px', color: t.textSecondary }}>
                    Configure your sending domain and default email settings
                  </p>
                </div>
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: t.bgHover,
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: t.textSecondary
                }}>
                  Admin Only
                </span>
              </div>

              <FormInput
                label="Sending Domain"
                value={formData.sending_domain}
                onChange={handleChange('sending_domain')}
                placeholder="emails.yourcompany.com"
                hint="The domain that will be used to send emails. Must be verified in SendGrid."
                theme={t}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormInput
                  label="Default From Name"
                  value={formData.default_from_name}
                  onChange={handleChange('default_from_name')}
                  placeholder="Your Company"
                  theme={t}
                />
                <FormInput
                  label="Default From Email"
                  value={formData.default_from_email}
                  onChange={handleChange('default_from_email')}
                  placeholder="noreply@yourcompany.com"
                  type="email"
                  theme={t}
                />
              </div>
              <FormInput
                label="Reply-To Email"
                value={formData.reply_to_email}
                onChange={handleChange('reply_to_email')}
                placeholder="support@yourcompany.com"
                type="email"
                hint="Where replies will be directed when recipients respond to automated emails."
                theme={t}
              />

              <button
                onClick={handleSaveSettings}
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
                {isSaving ? '💾 Saving...' : '💾 Save Configuration'}
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
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '24px' }}>
                Integrations
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
                      fontSize: '20px',
                      fontWeight: '700'
                    }}>
                      SG
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: t.text, marginBottom: '2px' }}>SendGrid</div>
                      <div style={{ fontSize: '13px', color: t.textSecondary }}>Email delivery service</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    <button style={{
                      padding: '8px 12px',
                      backgroundColor: t.bgHover,
                      border: `1px solid ${t.border}`,
                      borderRadius: '6px',
                      color: t.textSecondary,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}>
                      Configure
                    </button>
                  </div>
                </div>
              </div>

              {/* Salesforce Integration */}
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
                      backgroundColor: '#00A1E0',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '20px',
                      fontWeight: '700'
                    }}>
                      SF
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: t.text, marginBottom: '2px' }}>Salesforce</div>
                      <div style={{ fontSize: '13px', color: t.textSecondary }}>CRM data sync</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    <button style={{
                      padding: '8px 12px',
                      backgroundColor: t.bgHover,
                      border: `1px solid ${t.border}`,
                      borderRadius: '6px',
                      color: t.textSecondary,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}>
                      Sync Now
                    </button>
                  </div>
                </div>
              </div>

              {/* Webhook Info */}
              <div style={{
                padding: '16px',
                backgroundColor: `${t.primary}10`,
                borderRadius: '8px',
                marginTop: '24px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: t.text, marginBottom: '4px' }}>
                  📌 Webhook URL
                </div>
                <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>
                  Configure this URL in SendGrid to receive email event notifications
                </div>
                <code style={{
                  display: 'block',
                  padding: '8px 12px',
                  backgroundColor: t.bgCard,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: t.primary,
                  wordBreak: 'break-all'
                }}>
                  https://your-app-url.com/api/webhooks/sendgrid/{userId}
                </code>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingsPage;
