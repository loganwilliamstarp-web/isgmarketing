// src/services/timeline.js
import { supabase } from '../lib/supabase';

export const timelineService = {
  /**
   * Get all master automations with their associated templates
   * Returns automations grouped by category with timing information extracted
   */
  async getMasterAutomationsWithTemplates() {
    // Fetch master automations
    const { data: automations, error: automationsError } = await supabase
      .from('master_automations')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (automationsError) throw automationsError;

    // Fetch master templates
    const { data: templates, error: templatesError } = await supabase
      .from('master_templates')
      .select('*');

    if (templatesError) throw templatesError;

    // Create a lookup map for templates by default_key
    const templateMap = {};
    templates?.forEach(t => {
      templateMap[t.default_key] = t;
    });

    // Process automations to extract timing and template info
    const processedAutomations = automations?.map(automation => {
      const nodes = automation.nodes || [];
      const timing = extractTimingFromNodes(nodes);
      const templateKeys = extractTemplateKeysFromNodes(nodes);
      const lineOfBusiness = extractLineOfBusiness(automation);

      // Get full template objects for this automation
      const usedTemplates = templateKeys
        .map(key => templateMap[key])
        .filter(Boolean);

      return {
        ...automation,
        timing,
        templateKeys,
        templates: usedTemplates,
        lineOfBusiness,
        nodeCount: nodes.filter(n => n.type !== 'entry_criteria').length
      };
    }) || [];

    return {
      automations: processedAutomations,
      templates: templates || [],
      templateMap
    };
  },

  /**
   * Get automations filtered by various criteria
   */
  async getFilteredAutomations(filters = {}) {
    const { category, lineOfBusiness, search, dateRange } = filters;

    const { automations, templates, templateMap } = await this.getMasterAutomationsWithTemplates();

    let filtered = automations;

    // Filter by category
    if (category && category !== 'all') {
      filtered = filtered.filter(a => a.category?.toLowerCase() === category.toLowerCase());
    }

    // Filter by line of business (Personal/Commercial)
    if (lineOfBusiness && lineOfBusiness !== 'all') {
      filtered = filtered.filter(a => a.lineOfBusiness === lineOfBusiness);
    }

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(a =>
        a.name?.toLowerCase().includes(searchLower) ||
        a.description?.toLowerCase().includes(searchLower) ||
        a.default_key?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by date range (based on updated_at)
    if (dateRange?.start && dateRange?.end) {
      filtered = filtered.filter(a => {
        const updatedAt = new Date(a.updated_at);
        return updatedAt >= new Date(dateRange.start) && updatedAt <= new Date(dateRange.end);
      });
    }

    return {
      automations: filtered,
      templates,
      templateMap
    };
  },

  /**
   * Get lifecycle stages (categories) with their automations
   */
  async getLifecycleStages() {
    const { automations, templates, templateMap } = await this.getMasterAutomationsWithTemplates();

    // Define the lifecycle order
    const lifecycleOrder = ['Onboarding', 'Retention', 'Cross-Sell', 'Win-Back', 'Engagement'];

    // Group by category
    const grouped = {};
    automations.forEach(automation => {
      const category = automation.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(automation);
    });

    // Convert to ordered array
    const stages = lifecycleOrder
      .filter(stage => grouped[stage]?.length > 0)
      .map(stage => ({
        name: stage,
        automations: grouped[stage],
        color: getCategoryColor(stage)
      }));

    // Add any categories not in the standard order
    Object.keys(grouped).forEach(category => {
      if (!lifecycleOrder.includes(category)) {
        stages.push({
          name: category,
          automations: grouped[category],
          color: getCategoryColor(category)
        });
      }
    });

    return {
      stages,
      templates,
      templateMap
    };
  }
};

/**
 * Extract timing information from automation nodes
 * Calculates total days in the automation based on delay nodes
 */
function extractTimingFromNodes(nodes) {
  let totalDays = 0;
  const timingPoints = [];

  nodes.forEach((node, index) => {
    if (node.type === 'delay') {
      const days = node.config?.days || 0;
      const hours = node.config?.hours || 0;
      totalDays += days + (hours / 24);
      timingPoints.push({
        nodeId: node.id,
        nodeIndex: index,
        delayDays: days,
        delayHours: hours,
        cumulativeDays: totalDays
      });
    }

    if (node.type === 'send_email') {
      timingPoints.push({
        nodeId: node.id,
        nodeIndex: index,
        type: 'email',
        dayInSequence: Math.ceil(totalDays) || 1,
        templateKey: node.config?.templateKey || node.config?.template
      });
    }
  });

  // Extract trigger timing from filter_config if available
  let triggerDay = null;
  const entryCriteria = nodes.find(n => n.type === 'entry_criteria');
  if (entryCriteria?.config?.filterConfig?.groups) {
    const groups = entryCriteria.config.filterConfig.groups;
    groups.forEach(group => {
      group.rules?.forEach(rule => {
        if (rule.operator === 'equals_days_ago' || rule.operator === 'equals_days_from_now') {
          triggerDay = parseInt(rule.value) || null;
        }
      });
    });
  }

  return {
    totalDays: Math.ceil(totalDays),
    timingPoints,
    triggerDay,
    emailCount: timingPoints.filter(t => t.type === 'email').length
  };
}

/**
 * Extract template keys from automation nodes
 */
function extractTemplateKeysFromNodes(nodes) {
  const templateKeys = [];

  nodes.forEach(node => {
    if (node.type === 'send_email') {
      const key = node.config?.templateKey || node.config?.template;
      if (key && !templateKeys.includes(key)) {
        templateKeys.push(key);
      }
    }

    // Check branches for conditions
    if (node.branches) {
      Object.values(node.branches).forEach(branchNodes => {
        if (Array.isArray(branchNodes)) {
          branchNodes.forEach(branchNode => {
            if (branchNode.type === 'send_email') {
              const key = branchNode.config?.templateKey || branchNode.config?.template;
              if (key && !templateKeys.includes(key)) {
                templateKeys.push(key);
              }
            }
          });
        }
      });
    }
  });

  return templateKeys;
}

/**
 * Extract line of business from automation name/description/filters
 */
function extractLineOfBusiness(automation) {
  const name = automation.name?.toLowerCase() || '';
  const description = automation.description?.toLowerCase() || '';
  const defaultKey = automation.default_key?.toLowerCase() || '';

  // Check for explicit personal/commercial indicators
  if (name.includes('personal') || defaultKey.includes('personal') || description.includes('personal lines')) {
    return 'Personal';
  }
  if (name.includes('commercial') || defaultKey.includes('commercial') || description.includes('commercial')) {
    return 'Commercial';
  }

  // Check filter_config for policy_class conditions
  const filterConfig = automation.filter_config;
  if (filterConfig?.groups) {
    for (const group of filterConfig.groups) {
      for (const rule of (group.rules || group.conditions || [])) {
        if (rule.field === 'policy_class' || rule.field === 'account_type') {
          if (rule.value === 'Personal') return 'Personal';
          if (rule.value === 'Commercial') return 'Commercial';
        }
      }
    }
  }

  return 'All';
}

/**
 * Get color for a category
 */
function getCategoryColor(category) {
  const colors = {
    'Onboarding': '#8b5cf6', // Purple
    'Retention': '#3b82f6',  // Blue
    'Cross-Sell': '#22c55e', // Green
    'Win-Back': '#f59e0b',   // Amber
    'Engagement': '#ec4899', // Pink
    'Other': '#71717a'       // Gray
  };
  return colors[category] || colors['Other'];
}

export default timelineService;
