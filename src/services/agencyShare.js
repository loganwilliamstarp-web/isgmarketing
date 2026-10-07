// src/services/agencyShare.js
// Share an automation or template from one agent to others in the same agency.
//
// Copies are matched by name in each target's account: sharing again updates
// the existing copy in place (pushing the latest version) instead of creating
// duplicates. Master-synced (is_default) rows are never overwritten.
import { supabase } from '../lib/supabase';
import { collectTemplateRefs, remapNodeTemplates } from '../utils/agencyShare';

const TEMPLATE_FIELDS = ['name', 'subject', 'body_html', 'body_text', 'category', 'merge_fields'];
const AUTOMATION_FIELDS = [
  'name', 'description', 'category', 'send_time', 'timezone', 'frequency',
  'max_enrollments', 'enrollment_cooldown_days', 'distribute_evenly', 'filter_config',
];

const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f, row[f]]));

async function findCustomByName(table, ownerId, name) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('owner_id', ownerId)
    .eq('name', name)
    .eq('is_default', false)
    .order('id')
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

/** Create or update targetOwnerId's copy of a template. Returns the copy's id. */
async function upsertTemplateCopy(template, targetOwnerId) {
  const fields = pick(template, TEMPLATE_FIELDS);
  const existing = await findCustomByName('email_templates', targetOwnerId, template.name);

  if (existing) {
    const { error } = await supabase
      .from('email_templates')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, action: 'updated' };
  }

  const { data, error } = await supabase
    .from('email_templates')
    .insert({ ...fields, owner_id: targetOwnerId, is_default: false, default_key: null })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, action: 'created' };
}

const targetsExcluding = (targetOwnerIds, sourceOwnerId) =>
  [...new Set(targetOwnerIds)].filter((id) => id && id !== sourceOwnerId);

export const agencyShareService = {
  /**
   * Share a template with other agents.
   * @returns {Promise<Array<{ ownerId, ok, action?, error? }>>}
   */
  async shareTemplate({ templateId, sourceOwnerId, targetOwnerIds }) {
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('owner_id', sourceOwnerId)
      .single();
    if (error) throw error;

    const results = [];
    for (const ownerId of targetsExcluding(targetOwnerIds, sourceOwnerId)) {
      try {
        const { action } = await upsertTemplateCopy(template, ownerId);
        results.push({ ownerId, ok: true, action });
      } catch (err) {
        results.push({ ownerId, ok: false, error: err.message });
      }
    }
    return results;
  },

  /**
   * Share an automation (and the templates its workflow uses) with other agents.
   * @param {boolean} activate - turn the copy on; otherwise new copies are
   *   paused and existing copies keep their current status
   * @returns {Promise<Array<{ ownerId, ok, action?, templates?, error? }>>}
   */
  async shareAutomation({ automationId, sourceOwnerId, targetOwnerIds, activate = false }) {
    const { data: automation, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('owner_id', sourceOwnerId)
      .single();
    if (error) throw error;

    const refs = collectTemplateRefs(automation.nodes);

    const loadSourceTemplates = async (column, values) => {
      if (values.length === 0) return [];
      const { data, error: tplError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('owner_id', sourceOwnerId)
        .in(column, values);
      if (tplError) throw tplError;
      return data || [];
    };
    const templatesById = await loadSourceTemplates('id', refs.ids);
    const templatesByKey = await loadSourceTemplates('default_key', refs.keys);

    const results = [];
    for (const ownerId of targetsExcluding(targetOwnerIds, sourceOwnerId)) {
      try {
        const idMap = {};
        for (const template of templatesById) {
          idMap[String(template.id)] = (await upsertTemplateCopy(template, ownerId)).id;
        }

        // Key-only steps resolve against the target's own master templates
        // when they have one; otherwise give them a copy of the source's.
        const keyMap = {};
        if (templatesByKey.length > 0) {
          const { data: owned, error: ownedError } = await supabase
            .from('email_templates')
            .select('default_key')
            .eq('owner_id', ownerId)
            .in('default_key', templatesByKey.map((t) => t.default_key));
          if (ownedError) throw ownedError;
          const ownedKeys = new Set((owned || []).map((t) => t.default_key));
          for (const template of templatesByKey) {
            if (!ownedKeys.has(template.default_key)) {
              keyMap[template.default_key] = (await upsertTemplateCopy(template, ownerId)).id;
            }
          }
        }

        const fields = {
          ...pick(automation, AUTOMATION_FIELDS),
          nodes: remapNodeTemplates(automation.nodes, idMap, keyMap),
        };
        const templateCount = Object.keys(idMap).length + Object.keys(keyMap).length;
        const existing = await findCustomByName('automations', ownerId, automation.name);

        if (existing) {
          const { error: updateError } = await supabase
            .from('automations')
            .update({
              ...fields,
              ...(activate ? { status: 'active' } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (updateError) throw updateError;
          results.push({ ownerId, ok: true, action: 'updated', templates: templateCount });
        } else {
          const { error: insertError } = await supabase
            .from('automations')
            .insert({
              ...fields,
              owner_id: ownerId,
              is_default: false,
              default_key: null,
              status: activate ? 'active' : 'paused',
            });
          if (insertError) throw insertError;
          results.push({ ownerId, ok: true, action: 'created', templates: templateCount });
        }
      } catch (err) {
        results.push({ ownerId, ok: false, error: err.message });
      }
    }
    return results;
  },
};

export default agencyShareService;
