import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useTemplates,
  useTemplateMutations,
  useMassEmailBatchesWithStats,
  useMassEmailRecipients,
  useMassEmailRecipientCount,
  useMassEmailMutations
} from '../hooks';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Status badge component
const StatusBadge = ({ status, theme: t }) => {
  const colors = {
    Draft: { bg: t.textMuted, text: '#fff' },
    Scheduled: { bg: t.warning, text: '#fff' },
    Sending: { bg: t.primary, text: '#fff' },
    Completed: { bg: t.success, text: '#fff' },
    Cancelled: { bg: t.danger, text: '#fff' }
  };

  const color = colors[status] || colors.Draft;

  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      backgroundColor: `${color.bg}20`,
      color: color.bg,
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '500'
    }}>
      {status}
    </span>
  );
};

// Template Editor Modal (reused from TemplatesPage pattern)
const TemplateEditorModal = ({ template, onSave, onClose, theme: t }) => {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body_html || template?.body_text || '');
  const [category, setCategory] = useState(template?.category || 'general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const savedTemplate = await onSave({
        name,
        subject,
        body_html: body,
        body_text: body.replace(/<[^>]*>/g, ''),
        category
      });
      onClose(savedTemplate);
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const mergeFields = [
    { key: '{{first_name}}', label: 'First Name' },
    { key: '{{last_name}}', label: 'Last Name' },
    { key: '{{company_name}}', label: 'Company Name' },
    { key: '{{email}}', label: 'Email' },
    { key: '{{policy_type}}', label: 'Policy Type' },
    { key: '{{policy_expiration}}', label: 'Expiration Date' },
    { key: '{{agent_name}}', label: 'Agent Name' },
    { key: '{{agent_phone}}', label: 'Agent Phone' },
  ];

  const insertMergeField = (field) => {
    setBody(body + field);
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        onClick={() => onClose(null)}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button
            onClick={() => onClose(null)}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '20px' }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  color: t.text,
                  fontSize: '14px'
                }}
              >
                <option value="general">General</option>
                <option value="welcome">Welcome</option>
                <option value="renewal">Renewal</option>
                <option value="cross_sell">Cross-Sell</option>
                <option value="engagement">Engagement</option>
                <option value="policy_update">Policy Update</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Welcome to {{company_name}}!"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Insert Merge Field
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {mergeFields.map((field) => (
                <button
                  key={field.key}
                  onClick={() => insertMergeField(field.key)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    color: t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here. Use merge fields like {{first_name}} for personalization."
              rows={10}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                color: t.text,
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: '1.6'
              }}
            />
          </div>
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={() => onClose(null)}
            style={{
              padding: '10px 20px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name || !subject}
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: isSubmitting || !name || !subject ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create & Select'}
          </button>
        </div>
      </div>
    </>
  );
};

// Batch card for history
const BatchCard = ({ batch, onView, theme: t }) => {
  const sentPercent = batch.total_recipients > 0
    ? Math.round((batch.emails_sent / batch.total_recipients) * 100)
    : 0;

  return (
    <div style={{
      padding: '16px',
      backgroundColor: t.bgCard,
      borderRadius: '10px',
      border: `1px solid ${t.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontWeight: '600', color: t.text }}>{batch.name || 'Untitled Batch'}</span>
          <StatusBadge status={batch.status} theme={t} />
        </div>
        <p style={{ fontSize: '13px', color: t.textSecondary, margin: 0 }}>
          {batch.subject || 'No subject'}
        </p>
        <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
          {batch.template?.name || 'Custom email'} • {batch.total_recipients || 0} recipients
        </p>
      </div>

      {batch.status !== 'Draft' && (
        <div style={{ textAlign: 'right', minWidth: '100px' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: t.text }}>{sentPercent}%</div>
          <div style={{ fontSize: '11px', color: t.textMuted }}>
            {batch.emails_sent || 0} / {batch.total_recipients || 0} sent
          </div>
        </div>
      )}

      <button
        onClick={() => onView(batch)}
        style={{
          padding: '8px 16px',
          backgroundColor: t.bgHover,
          border: `1px solid ${t.border}`,
          borderRadius: '6px',
          color: t.text,
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        View
      </button>
    </div>
  );
};

// Step indicator
const StepIndicator = ({ currentStep, steps, theme: t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
    {steps.map((step, index) => (
      <React.Fragment key={step}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: index <= currentStep ? t.primary : t.bgHover,
            color: index <= currentStep ? '#fff' : t.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            {index < currentStep ? '✓' : index + 1}
          </div>
          <span style={{
            fontSize: '14px',
            fontWeight: index === currentStep ? '600' : '400',
            color: index <= currentStep ? t.text : t.textMuted
          }}>
            {step}
          </span>
        </div>
        {index < steps.length - 1 && (
          <div style={{
            flex: 1,
            height: '2px',
            backgroundColor: index < currentStep ? t.primary : t.border,
            minWidth: '40px'
          }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// Template selection step with create new option
const TemplateStep = ({ selectedTemplate, onSelect, onCreateNew, templates, isLoading, theme: t }) => {
  const [search, setSearch] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!search) return templates;
    return templates.filter(tmpl =>
      tmpl.name.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.subject.toLowerCase().includes(search.toLowerCase())
    );
  }, [templates, search]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
          Select an Email Template
        </h3>
        <button
          onClick={onCreateNew}
          style={{
            padding: '8px 16px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>+</span> Create New Template
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px 10px 36px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px'
          }}
        />
        <span style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: t.textMuted
        }}>
          🔍
        </span>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '16px', backgroundColor: t.bgCard, borderRadius: '10px', border: `1px solid ${t.border}` }}>
              <Skeleton width="120px" height="16px" />
              <div style={{ marginTop: '8px' }}><Skeleton width="200px" height="14px" /></div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', maxHeight: '400px', overflow: 'auto' }}>
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              onClick={() => onSelect(template)}
              style={{
                padding: '16px',
                backgroundColor: t.bgCard,
                borderRadius: '10px',
                border: `2px solid ${selectedTemplate?.id === template.id ? t.primary : t.border}`,
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
                {template.name}
              </div>
              <div style={{ fontSize: '13px', color: t.textSecondary }}>
                {template.subject}
              </div>
              <div style={{
                marginTop: '8px',
                padding: '4px 8px',
                backgroundColor: `${t.primary}15`,
                color: t.primary,
                borderRadius: '4px',
                fontSize: '11px',
                display: 'inline-block',
                textTransform: 'capitalize'
              }}>
                {template.category || 'General'}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filteredTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
          {search ? 'No templates match your search' : 'No templates available. Create one to get started!'}
        </div>
      )}
    </div>
  );
};

// Filter rule definitions
const FILTER_FIELDS = [
  { value: 'account_status', label: 'Account Status', type: 'select', options: [
    { value: 'customer', label: 'Customer' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'prior_customer', label: 'Prior Customer' },
    { value: 'lead', label: 'Lead' }
  ]},
  { value: 'policy_type', label: 'Policy Type', type: 'select', options: [
    { value: 'Auto', label: 'Auto' },
    { value: 'Home', label: 'Home' },
    { value: 'Renters', label: 'Renters' },
    { value: 'Life', label: 'Life' },
    { value: 'Umbrella', label: 'Umbrella' },
    { value: 'Commercial', label: 'Commercial' },
    { value: 'Health', label: 'Health' }
  ]},
  { value: 'policy_count', label: 'Number of Policies', type: 'number' },
  { value: 'policy_expiration', label: 'Policy Expiration', type: 'date' },
  { value: 'location', label: 'Location', type: 'location' },
  { value: 'state', label: 'State', type: 'select', options: [
    { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
    { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
    { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
    { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
    { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
    { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
    { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
    { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
    { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
    { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
    { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
    { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
    { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
    { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
    { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
    { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
    { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
  ]},
  { value: 'city', label: 'City', type: 'text' },
];

const OPERATORS = {
  select: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'is_any', label: 'is any of' },
  ],
  number: [
    { value: 'equals', label: 'equals' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'at_least', label: 'at least' },
  ],
  date: [
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'between', label: 'is between' },
    { value: 'in_next_days', label: 'is in the next' },
  ],
  location: [
    { value: 'within_radius', label: 'is within' },
  ],
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'starts_with', label: 'starts with' },
  ],
};

// Radius options in miles
const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];

// Component to fit map bounds to circle
const FitBoundsToCircle = ({ center, radiusMeters }) => {
  const map = useMap();

  useEffect(() => {
    if (center && radiusMeters && map) {
      // Calculate bounds manually using the center and radius
      // radiusMeters in degrees (rough approximation: 1 degree ≈ 111km at equator)
      const radiusDegrees = radiusMeters / 111320;
      const bounds = L.latLngBounds(
        [center[0] - radiusDegrees, center[1] - radiusDegrees],
        [center[0] + radiusDegrees, center[1] + radiusDegrees]
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, center, radiusMeters]);

  return null;
};

// Map modal component with Leaflet
const LocationMapModal = ({ location, radius, onClose, theme: t }) => {
  if (!location) return null;

  const lat = parseFloat(location.lat);
  const lng = parseFloat(location.lng);
  const radiusMeters = radius * 1609.34; // Convert miles to meters

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 1000
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxWidth: '95vw',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        zIndex: 1001,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
              Location Radius Preview
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: t.textSecondary }}>
              📍 {location.display}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '6px 12px',
              backgroundColor: `${t.primary}15`,
              color: t.primary,
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {radius} mile radius
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: '24px',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Map */}
        <div style={{ height: '400px' }}>
          <MapContainer
            center={[lat, lng]}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Circle
              center={[lat, lng]}
              radius={radiusMeters}
              pathOptions={{
                color: t.primary,
                fillColor: t.primary,
                fillOpacity: 0.2,
                weight: 3
              }}
            />
            <Marker position={[lat, lng]} />
            <FitBoundsToCircle center={[lat, lng]} radiusMeters={radiusMeters} />
          </MapContainer>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${t.border}`,
          backgroundColor: t.bgHover,
          fontSize: '12px',
          color: t.textSecondary,
          textAlign: 'center'
        }}>
          Recipients within this area will be included in your campaign
        </div>
      </div>
    </>
  );
};

// Simple preview button that opens the map modal
const LocationMapPreview = ({ location, radius, theme: t }) => {
  const [showModal, setShowModal] = useState(false);

  if (!location) return null;

  return (
    <>
      <div style={{
        marginTop: '12px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${t.border}`
      }}>
        <div style={{
          padding: '12px 16px',
          backgroundColor: t.bgHover,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📍</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>
                {location.display}
              </div>
              <div style={{ fontSize: '12px', color: t.textSecondary }}>
                {radius} mile radius
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🗺️ View Map
          </button>
        </div>
      </div>

      {showModal && (
        <LocationMapModal
          location={location}
          radius={radius}
          onClose={() => setShowModal(false)}
          theme={t}
        />
      )}
    </>
  );
};

// Single filter rule component
const FilterRule = ({ rule, index, onUpdate, onRemove, theme: t }) => {
  const field = FILTER_FIELDS.find(f => f.value === rule.field);
  const operators = field ? OPERATORS[field.type] : [];

  const selectStyle = {
    padding: '8px 12px',
    backgroundColor: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    color: t.text,
    fontSize: '13px',
    minWidth: '140px'
  };

  const inputStyle = {
    padding: '8px 12px',
    backgroundColor: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    color: t.text,
    fontSize: '13px',
    width: '120px'
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      backgroundColor: t.bgCard,
      borderRadius: '8px',
      border: `1px solid ${t.border}`,
      flexWrap: 'wrap'
    }}>
      {index > 0 && (
        <span style={{
          fontSize: '12px',
          color: t.primary,
          fontWeight: '600',
          padding: '4px 8px',
          backgroundColor: `${t.primary}15`,
          borderRadius: '4px'
        }}>
          AND
        </span>
      )}

      {/* Field selector */}
      <select
        value={rule.field || ''}
        onChange={(e) => onUpdate(index, { ...rule, field: e.target.value, operator: '', value: '' })}
        style={selectStyle}
      >
        <option value="">Select field...</option>
        {FILTER_FIELDS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Operator selector */}
      {rule.field && (
        <select
          value={rule.operator || ''}
          onChange={(e) => onUpdate(index, { ...rule, operator: e.target.value })}
          style={selectStyle}
        >
          <option value="">Select condition...</option>
          {operators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      )}

      {/* Value input - varies by field type */}
      {rule.field && rule.operator && (
        <>
          {field?.type === 'select' && rule.operator !== 'is_any' && (
            <select
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              style={selectStyle}
            >
              <option value="">Select value...</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {field?.type === 'select' && rule.operator === 'is_any' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {field.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    const currentValues = rule.value ? rule.value.split(',') : [];
                    const newValues = currentValues.includes(opt.value)
                      ? currentValues.filter(v => v !== opt.value)
                      : [...currentValues, opt.value];
                    onUpdate(index, { ...rule, value: newValues.join(',') });
                  }}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: (rule.value || '').split(',').includes(opt.value) ? t.primary : t.bgHover,
                    color: (rule.value || '').split(',').includes(opt.value) ? '#fff' : t.text,
                    border: `1px solid ${(rule.value || '').split(',').includes(opt.value) ? t.primary : t.border}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {field?.type === 'number' && (
            <input
              type="number"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              placeholder="0"
              style={inputStyle}
            />
          )}

          {field?.type === 'date' && rule.operator === 'in_next_days' && (
            <>
              <input
                type="number"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="30"
                style={{ ...inputStyle, width: '70px' }}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>days</span>
            </>
          )}

          {field?.type === 'date' && rule.operator === 'between' && (
            <>
              <input
                type="date"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                style={inputStyle}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>and</span>
              <input
                type="date"
                value={rule.value2 || ''}
                onChange={(e) => onUpdate(index, { ...rule, value2: e.target.value })}
                style={inputStyle}
              />
            </>
          )}

          {field?.type === 'date' && (rule.operator === 'before' || rule.operator === 'after') && (
            <input
              type="date"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              style={inputStyle}
            />
          )}

          {field?.type === 'text' && (
            <input
              type="text"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              style={{ ...inputStyle, width: '160px' }}
            />
          )}

          {field?.type === 'location' && (
            <LocationFilterInput
              rule={rule}
              onUpdate={(updates) => onUpdate(index, { ...rule, ...updates })}
              theme={t}
            />
          )}
        </>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(index)}
        style={{
          marginLeft: 'auto',
          padding: '6px 10px',
          backgroundColor: 'transparent',
          border: 'none',
          color: t.textMuted,
          cursor: 'pointer',
          fontSize: '16px',
          borderRadius: '4px'
        }}
        title="Remove filter"
      >
        ×
      </button>
    </div>
  );
};

// Location filter input with geocoding and map preview
const LocationFilterInput = ({ rule, onUpdate, theme: t }) => {
  const [searchText, setSearchText] = useState(rule.locationDisplay || '');
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputStyle = {
    padding: '8px 12px',
    backgroundColor: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    color: t.text,
    fontSize: '13px'
  };

  // Debounced geocoding search using Nominatim (free, no API key needed)
  const searchLocation = async (query) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await response.json();
      setSuggestions(data.map(item => ({
        display: item.display_name,
        lat: item.lat,
        lng: item.lon,
        type: item.type
      })));
      setShowSuggestions(true);
    } catch (err) {
      console.error('Geocoding error:', err);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText && searchText !== rule.locationDisplay) {
        searchLocation(searchText);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const selectLocation = (location) => {
    setSearchText(location.display.split(',').slice(0, 2).join(','));
    onUpdate({
      value: `${location.lat},${location.lng}`,
      locationDisplay: location.display.split(',').slice(0, 2).join(','),
      locationData: location
    });
    setShowSuggestions(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Enter zip code, city, or address..."
            style={{ ...inputStyle, width: '100%', paddingRight: '30px' }}
          />
          {isSearching && (
            <span style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: t.textMuted,
              fontSize: '12px'
            }}>
              ...
            </span>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              marginTop: '4px',
              zIndex: 100,
              maxHeight: '200px',
              overflow: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              {suggestions.map((loc, i) => (
                <button
                  key={i}
                  onClick={() => selectLocation(loc)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: i < suggestions.length - 1 ? `1px solid ${t.border}` : 'none',
                    color: t.text,
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = t.bgHover}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <span>📍</span>
                  <span style={{ lineHeight: '1.4' }}>{loc.display}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ fontSize: '13px', color: t.textSecondary }}>of</span>

        <select
          value={rule.radius || '25'}
          onChange={(e) => onUpdate({ radius: e.target.value })}
          style={{ ...inputStyle, minWidth: '100px' }}
        >
          {RADIUS_OPTIONS.map(r => (
            <option key={r} value={r}>{r} miles</option>
          ))}
        </select>
      </div>

      {/* Map Preview */}
      {rule.locationData && (
        <LocationMapPreview
          location={rule.locationData}
          radius={parseInt(rule.radius || '25', 10)}
          theme={t}
        />
      )}
    </div>
  );
};

// Recipients filter step with dynamic filter builder
const RecipientsStep = ({ filterConfig, setFilterConfig, recipientCount, isLoading, theme: t }) => {
  const rules = filterConfig.rules || [];

  const addRule = () => {
    setFilterConfig({
      ...filterConfig,
      rules: [...rules, { field: '', operator: '', value: '' }]
    });
  };

  const updateRule = (index, updatedRule) => {
    const newRules = [...rules];
    newRules[index] = updatedRule;
    setFilterConfig({ ...filterConfig, rules: newRules });
  };

  const removeRule = (index) => {
    const newRules = rules.filter((_, i) => i !== index);
    setFilterConfig({ ...filterConfig, rules: newRules });
  };

  const clearAllFilters = () => {
    setFilterConfig({ ...filterConfig, rules: [], search: '' });
  };

  // Count complete (valid) filters
  const completeFiltersCount = rules.filter(r => r.field && r.operator && r.value).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
          Filter Recipients
        </h3>
        {(rules.length > 0 || filterConfig.search) && (
          <button
            onClick={clearAllFilters}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter Rules */}
      <div style={{
        padding: '16px',
        backgroundColor: t.bgHover,
        borderRadius: '12px',
        marginBottom: '16px'
      }}>
        {rules.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: t.textMuted,
            fontSize: '14px'
          }}>
            No filters applied. All accounts with valid emails will be included.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {rules.map((rule, index) => (
              <FilterRule
                key={index}
                rule={rule}
                index={index}
                onUpdate={updateRule}
                onRemove={removeRule}
                theme={t}
              />
            ))}
          </div>
        )}

        <button
          onClick={addRule}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: t.bgCard,
            border: `1px dashed ${t.border}`,
            borderRadius: '8px',
            color: t.primary,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>+</span> Add Filter
        </button>
      </div>

      {/* Quick filter summary */}
      {completeFiltersCount > 0 && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: `${t.primary}10`,
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: t.text
        }}>
          <strong>{completeFiltersCount}</strong> filter{completeFiltersCount !== 1 ? 's' : ''} applied
          <span style={{ color: t.textSecondary }}> — results update automatically</span>
        </div>
      )}

      {/* Search Filter */}
      <div style={{
        padding: '16px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '8px' }}>
          Search by Name or Email
        </label>
        <input
          type="text"
          placeholder="Type to search..."
          value={filterConfig.search || ''}
          onChange={(e) => setFilterConfig({ ...filterConfig, search: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px'
          }}
        />
      </div>

      {/* Recipient Count */}
      <div style={{
        padding: '20px',
        backgroundColor: `${t.primary}10`,
        borderRadius: '12px',
        border: `1px solid ${t.primary}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
            Matching Recipients
          </div>
          <div style={{ fontSize: '12px', color: t.textSecondary }}>
            Accounts with valid emails who haven't opted out
          </div>
        </div>
        <div style={{ fontSize: '28px', fontWeight: '700', color: t.primary }}>
          {isLoading ? '...' : (recipientCount || 0).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

// Review step
const ReviewStep = ({ template, filterConfig, subject, setSubject, name, setName, recipients, isLoadingRecipients, theme: t }) => {
  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
        Review & Send
      </h3>

      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
          Campaign Name
        </label>
        <input
          type="text"
          placeholder="e.g., December Newsletter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px'
          }}
        />
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        marginBottom: '16px'
      }}>
        <label style={{ fontSize: '13px', fontWeight: '500', color: t.text, display: 'block', marginBottom: '6px' }}>
          Subject Line
        </label>
        <input
          type="text"
          placeholder="Email subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px'
          }}
        />
        <p style={{ fontSize: '12px', color: t.textMuted, marginTop: '6px' }}>
          Use merge fields like {'{{first_name}}'} for personalization
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '16px'
      }}>
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '4px' }}>Template</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>{template?.name}</div>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '4px' }}>Recipients</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
            {isLoadingRecipients ? '...' : (recipients?.length || 0).toLocaleString()} accounts
          </div>
        </div>
      </div>

      {recipients && recipients.length > 0 && (
        <div style={{
          padding: '16px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: t.text, marginBottom: '12px' }}>
            Preview Recipients (first 10)
          </div>
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {recipients.slice(0, 10).map((recipient, i) => (
              <div
                key={recipient.account_unique_id}
                style={{
                  padding: '8px 0',
                  borderBottom: i < Math.min(9, recipients.length - 1) ? `1px solid ${t.border}` : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', color: t.text }}>
                    {recipient.primary_contact_first_name
                      ? `${recipient.primary_contact_first_name} ${recipient.primary_contact_last_name || ''}`
                      : recipient.name}
                  </div>
                  <div style={{ fontSize: '12px', color: t.textMuted }}>
                    {recipient.person_email || recipient.email}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: t.bgHover,
                  color: t.textSecondary,
                  borderRadius: '4px',
                  fontSize: '11px',
                  textTransform: 'capitalize'
                }}>
                  {recipient.account_status}
                </span>
              </div>
            ))}
          </div>
          {recipients.length > 10 && (
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '8px', textAlign: 'center' }}>
              +{recipients.length - 10} more recipients
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Main component
const MassEmailPage = ({ t }) => {
  const { userId } = useParams();
  const [showWizard, setShowWizard] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [filterConfig, setFilterConfig] = useState({
    rules: [],
    search: '',
    notOptedOut: true
  });
  const [subject, setSubject] = useState('');
  const [name, setName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch data
  const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } = useTemplates();
  const { data: batches, isLoading: loadingBatches, refetch: refetchBatches } = useMassEmailBatchesWithStats();
  const { data: recipientCount, isLoading: loadingCount } = useMassEmailRecipientCount(
    step >= 1 ? filterConfig : null
  );
  const { data: recipients, isLoading: loadingRecipients } = useMassEmailRecipients(
    step === 2 ? filterConfig : null,
    { limit: 100 }
  );

  const { createBatch, scheduleBatch } = useMassEmailMutations();
  const { createTemplate } = useTemplateMutations();

  const steps = ['Select Template', 'Filter Recipients', 'Review & Send'];

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setSubject(template.subject || '');
  };

  const handleCreateTemplate = async (templateData) => {
    const newTemplate = await createTemplate.mutateAsync(templateData);
    await refetchTemplates();
    return newTemplate;
  };

  const handleTemplateEditorClose = (savedTemplate) => {
    setShowTemplateEditor(false);
    if (savedTemplate) {
      setSelectedTemplate(savedTemplate);
      setSubject(savedTemplate.subject || '');
    }
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate || !subject) return;

    setIsSending(true);
    setError(null);

    try {
      // Create the batch
      const batch = await createBatch.mutateAsync({
        name: name || `Mass Email - ${new Date().toLocaleDateString()}`,
        subject,
        template_id: selectedTemplate.id,
        filter_config: filterConfig,
        total_recipients: recipientCount || 0
      });

      // Schedule it for immediate sending
      await scheduleBatch.mutateAsync({ batchId: batch.id });

      setSuccess(`Successfully scheduled ${recipientCount} emails for sending!`);
      setShowWizard(false);
      resetWizard();
      refetchBatches();
    } catch (err) {
      setError(err.message || 'Failed to send mass email');
    } finally {
      setIsSending(false);
    }
  };

  const resetWizard = () => {
    setStep(0);
    setSelectedTemplate(null);
    setFilterConfig({
      rules: [],
      search: '',
      notOptedOut: true
    });
    setSubject('');
    setName('');
  };

  const canProceed = () => {
    if (step === 0) return !!selectedTemplate;
    if (step === 1) return (recipientCount || 0) > 0;
    if (step === 2) return !!subject && !!name;
    return false;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Mass Email
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Send one-off emails to filtered recipients
          </p>
        </div>
        {!showWizard && (
          <button
            onClick={() => setShowWizard(true)}
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
            <span>+</span> New Campaign
          </button>
        )}
      </div>

      {/* Success message */}
      {success && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.success}15`,
          border: `1px solid ${t.success}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.success,
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ background: 'none', border: 'none', color: t.success, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {showWizard ? (
        <div style={{
          backgroundColor: t.bgCard,
          borderRadius: '16px',
          border: `1px solid ${t.border}`,
          padding: '24px'
        }}>
          <StepIndicator currentStep={step} steps={steps} theme={t} />

          {/* Error message */}
          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: `${t.danger}15`,
              border: `1px solid ${t.danger}30`,
              borderRadius: '8px',
              marginBottom: '16px',
              color: t.danger,
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Step content */}
          <div style={{ minHeight: '300px' }}>
            {step === 0 && (
              <TemplateStep
                selectedTemplate={selectedTemplate}
                onSelect={handleTemplateSelect}
                onCreateNew={() => setShowTemplateEditor(true)}
                templates={templates}
                isLoading={loadingTemplates}
                theme={t}
              />
            )}
            {step === 1 && (
              <RecipientsStep
                filterConfig={filterConfig}
                setFilterConfig={setFilterConfig}
                recipientCount={recipientCount}
                isLoading={loadingCount}
                theme={t}
              />
            )}
            {step === 2 && (
              <ReviewStep
                template={selectedTemplate}
                filterConfig={filterConfig}
                subject={subject}
                setSubject={setSubject}
                name={name}
                setName={setName}
                recipients={recipients}
                isLoadingRecipients={loadingRecipients}
                theme={t}
              />
            )}
          </div>

          {/* Navigation */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '24px',
            borderTop: `1px solid ${t.border}`,
            marginTop: '24px'
          }}>
            <button
              onClick={() => {
                if (step === 0) {
                  setShowWizard(false);
                  resetWizard();
                } else {
                  handleBack();
                }
              }}
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
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {step < 2 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                style={{
                  padding: '10px 24px',
                  backgroundColor: canProceed() ? t.primary : t.bgHover,
                  border: 'none',
                  borderRadius: '8px',
                  color: canProceed() ? '#fff' : t.textMuted,
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canProceed() || isSending}
                style={{
                  padding: '10px 24px',
                  backgroundColor: canProceed() && !isSending ? t.success : t.bgHover,
                  border: 'none',
                  borderRadius: '8px',
                  color: canProceed() && !isSending ? '#fff' : t.textMuted,
                  cursor: canProceed() && !isSending ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isSending ? 'Sending...' : 'Send Emails'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Recent campaigns */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: t.text, marginBottom: '16px' }}>
              Recent Campaigns
            </h2>

            {loadingBatches ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ padding: '16px', backgroundColor: t.bgCard, borderRadius: '10px', border: `1px solid ${t.border}` }}>
                    <Skeleton width="200px" height="18px" />
                    <div style={{ marginTop: '8px' }}><Skeleton width="300px" height="14px" /></div>
                  </div>
                ))}
              </div>
            ) : batches && batches.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {batches.map(batch => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    onView={(b) => console.log('View batch:', b)}
                    theme={t}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: '60px 20px',
                backgroundColor: t.bgCard,
                borderRadius: '12px',
                border: `1px solid ${t.border}`,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
                  No campaigns yet
                </h3>
                <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
                  Create your first mass email campaign to reach your clients.
                </p>
                <button
                  onClick={() => setShowWizard(true)}
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
                  Create Your First Campaign
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <TemplateEditorModal
          template={null}
          onSave={handleCreateTemplate}
          onClose={handleTemplateEditorClose}
          theme={t}
        />
      )}
    </div>
  );
};

export default MassEmailPage;
