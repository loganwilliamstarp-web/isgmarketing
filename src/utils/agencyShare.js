// src/utils/agencyShare.js
//
// Pure helpers for copying an automation's workflow to other agents.
// send_email nodes reference templates either by id (config.template) or by
// master key (config.templateKey, resolved per owner by the engine). Nodes can
// nest under branches, so both helpers walk the whole tree.

const isSendEmail = (value) =>
  value && typeof value === 'object' && value.type === 'send_email' && value.config;

function walk(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
  } else if (value && typeof value === 'object') {
    if (isSendEmail(value)) visit(value);
    Object.values(value).forEach((child) => walk(child, visit));
  }
}

/**
 * Template references used by a workflow.
 * @returns {{ ids: string[], keys: string[] }} keys only lists send_email
 *   nodes that rely on templateKey alone (no direct template id).
 */
export function collectTemplateRefs(nodes) {
  const ids = new Set();
  const keys = new Set();
  walk(nodes, (node) => {
    const { template, templateKey } = node.config;
    if (template !== undefined && template !== null && template !== '') {
      ids.add(String(template));
    } else if (templateKey) {
      keys.add(templateKey);
    }
  });
  return { ids: [...ids], keys: [...keys] };
}

/**
 * Deep-copy nodes, pointing send_email nodes at the target owner's templates.
 * @param {Object} idMap   source template id -> target template id
 * @param {Object} keyMap  templateKey -> target template id, for keys the
 *   target owner can't resolve on their own
 */
export function remapNodeTemplates(nodes, idMap = {}, keyMap = {}) {
  const copy = JSON.parse(JSON.stringify(nodes ?? []));
  walk(copy, (node) => {
    const { template, templateKey } = node.config;
    if (template !== undefined && template !== null && template !== '') {
      const mapped = idMap[String(template)];
      if (mapped !== undefined) {
        node.config.template = typeof template === 'string' ? String(mapped) : mapped;
      }
    } else if (templateKey && keyMap[templateKey] !== undefined) {
      node.config.template = keyMap[templateKey];
    }
  });
  return copy;
}
