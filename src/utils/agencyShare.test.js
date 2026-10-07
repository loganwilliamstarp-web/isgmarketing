import { describe, expect, it } from 'vitest';
import { collectTemplateRefs, remapNodeTemplates } from './agencyShare';

const nodes = [
  { id: 'trigger', type: 'trigger', config: { time: '10:00' } },
  { id: 'e1', type: 'send_email', config: { template: 101, templateName: 'Welcome' } },
  {
    id: 'c1',
    type: 'condition',
    config: { type: 'opened', emailNodeId: 'e1' },
    branches: {
      yes: [{ id: 'e2', type: 'send_email', config: { template: '102' } }],
      no: [{ id: 'e3', type: 'send_email', config: { templateKey: 'prospect_all' } }],
    },
  },
  { id: 'e4', type: 'send_email', config: { template: 101, templateKey: 'welcome' } },
];

describe('collectTemplateRefs', () => {
  it('finds ids and key-only references, including nested branches', () => {
    expect(collectTemplateRefs(nodes)).toEqual({ ids: ['101', '102'], keys: ['prospect_all'] });
  });

  it('handles empty or missing nodes', () => {
    expect(collectTemplateRefs(null)).toEqual({ ids: [], keys: [] });
    expect(collectTemplateRefs([])).toEqual({ ids: [], keys: [] });
  });
});

describe('remapNodeTemplates', () => {
  it('rewrites ids (keeping their type) and fills unresolved keys', () => {
    const out = remapNodeTemplates(nodes, { 101: 901, 102: 902 }, { prospect_all: 903 });
    expect(out[1].config.template).toBe(901);
    expect(out[2].branches.yes[0].config.template).toBe('902');
    expect(out[2].branches.no[0].config).toEqual({ templateKey: 'prospect_all', template: 903 });
    expect(out[3].config).toEqual({ template: 901, templateKey: 'welcome' });
  });

  it('leaves the source untouched and unmapped refs as-is', () => {
    const out = remapNodeTemplates(nodes, {}, {});
    expect(out).toEqual(nodes);
    expect(out).not.toBe(nodes);
    expect(nodes[1].config.template).toBe(101);
  });
});
