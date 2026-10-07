// src/components/ShareWithAgencyModal.jsx
// Lets an agency admin copy an automation or template to agents in the same
// agency (users.profile_name). Re-sharing updates each agent's existing copy.
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from '../services/admin';
import { agencyShareService } from '../services/agencyShare';

const agentName = (agent) =>
  `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || agent.email;

const ShareWithAgencyModal = ({ kind, item, onClose, theme: t }) => {
  const queryClient = useQueryClient();
  const [agents, setAgents] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [activate, setActivate] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // The item's owner decides the agency, so a master admin viewing another
  // agency shares within that agency.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const agency = await adminService.getUserProfileName(item.owner_id);
        if (!agency) throw new Error('This agent is not assigned to an agency.');
        const members = (await adminService.getUsersByAgency(agency))
          .filter((agent) => agent.user_unique_id !== item.owner_id);
        if (cancelled) return;
        setAgents(members);
        setSelected(new Set(members.map((agent) => agent.user_unique_id)));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [item.owner_id]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleShare = async () => {
    setSharing(true);
    setError(null);
    try {
      const params = { sourceOwnerId: item.owner_id, targetOwnerIds: [...selected] };
      const out = kind === 'automation'
        ? await agencyShareService.shareAutomation({ ...params, automationId: item.id, activate })
        : await agencyShareService.shareTemplate({ ...params, templateId: item.id });
      setResults(out);
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSharing(false);
    }
  };

  const nameFor = (ownerId) => {
    const agent = agents?.find((a) => a.user_unique_id === ownerId);
    return agent ? agentName(agent) : ownerId;
  };

  const button = (primary) => ({
    padding: '10px 18px',
    backgroundColor: primary ? t.primary : 'transparent',
    border: primary ? 'none' : `1px solid ${t.border}`,
    borderRadius: '8px',
    color: primary ? '#fff' : t.textSecondary,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: primary ? '500' : '400',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: t.bgCard, borderRadius: '12px', border: `1px solid ${t.border}`,
          width: '100%', maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}` }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: t.text, margin: 0 }}>
            Share with agency
          </h2>
          <p style={{ fontSize: '13px', color: t.textSecondary, margin: '6px 0 0' }}>
            Copy <strong>{item.name}</strong>
            {kind === 'automation' ? ' and the templates it uses' : ''} to agents in this agency.
            Agents who already have a copy with this name get it updated.
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              padding: '10px 12px', marginBottom: '12px', borderRadius: '8px', fontSize: '13px',
              backgroundColor: `${t.danger}15`, border: `1px solid ${t.danger}30`, color: t.danger,
            }}>
              {error}
            </div>
          )}

          {results ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {results.length === 0 && (
                <div style={{ fontSize: '13px', color: t.textMuted }}>No agents were selected.</div>
              )}
              {results.map((r) => (
                <div key={r.ownerId} style={{ fontSize: '13px', color: r.ok ? t.text : t.danger }}>
                  {r.ok ? '✓' : '✕'} {nameFor(r.ownerId)}
                  <span style={{ color: t.textMuted }}>
                    {r.ok
                      ? ` — ${r.action}${r.templates ? `, ${r.templates} template${r.templates === 1 ? '' : 's'}` : ''}`
                      : ` — ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          ) : !agents ? (
            !error && <div style={{ fontSize: '13px', color: t.textMuted }}>Loading agents…</div>
          ) : agents.length === 0 ? (
            <div style={{ fontSize: '13px', color: t.textMuted }}>No other agents in this agency.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: t.textMuted }}>
                  {selected.size} of {agents.length} selected
                </span>
                <button
                  onClick={() => setSelected(
                    selected.size === agents.length ? new Set() : new Set(agents.map((a) => a.user_unique_id))
                  )}
                  style={{ background: 'none', border: 'none', color: t.primary, cursor: 'pointer', fontSize: '12px' }}
                >
                  {selected.size === agents.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {agents.map((agent) => (
                <label
                  key={agent.user_unique_id}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(agent.user_unique_id)}
                    onChange={() => toggle(agent.user_unique_id)}
                  />
                  <span style={{ fontSize: '14px', color: t.text }}>{agentName(agent)}</span>
                  <span style={{ fontSize: '12px', color: t.textMuted }}>{agent.email}</span>
                </label>
              ))}

              {kind === 'automation' && (
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '14px',
                  paddingTop: '14px', borderTop: `1px solid ${t.border}`, cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                  <span style={{ fontSize: '13px', color: t.text }}>
                    Turn it on for these agents
                    <span style={{ display: 'block', fontSize: '12px', color: t.textMuted }}>
                      Otherwise new copies start paused and existing copies keep their current status.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '16px 24px', borderTop: `1px solid ${t.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button onClick={onClose} style={button(false)}>{results ? 'Done' : 'Cancel'}</button>
          {!results && (
            <button
              onClick={handleShare}
              disabled={sharing || !agents || selected.size === 0}
              style={{ ...button(true), opacity: sharing || !agents || selected.size === 0 ? 0.5 : 1 }}
            >
              {sharing ? 'Sharing…' : `Share with ${selected.size} agent${selected.size === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareWithAgencyModal;
