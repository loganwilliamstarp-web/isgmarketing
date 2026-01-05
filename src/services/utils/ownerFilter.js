// src/services/utils/ownerFilter.js

/**
 * Apply owner_id filter to a Supabase query.
 * Supports both single owner ID (string) and multiple owner IDs (array).
 *
 * @param {Object} query - Supabase query builder
 * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
 * @param {string} column - Column name to filter on (default: 'owner_id')
 * @returns {Object} Modified query with owner filter applied
 */
export function applyOwnerFilter(query, ownerIds, column = 'owner_id') {
  if (!ownerIds) {
    return query;
  }

  if (Array.isArray(ownerIds)) {
    if (ownerIds.length === 0) {
      return query;
    }
    if (ownerIds.length === 1) {
      return query.eq(column, ownerIds[0]);
    }
    return query.in(column, ownerIds);
  }

  // Single owner ID (string)
  return query.eq(column, ownerIds);
}

/**
 * Get the first owner ID from ownerIds (for mutations that need a single owner)
 *
 * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
 * @returns {string|null} First owner ID or null
 */
export function getFirstOwnerId(ownerIds) {
  if (!ownerIds) return null;
  if (Array.isArray(ownerIds)) {
    return ownerIds.length > 0 ? ownerIds[0] : null;
  }
  return ownerIds;
}

/**
 * Normalize owner IDs to always be an array
 *
 * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
 * @returns {string[]} Array of owner IDs
 */
export function normalizeOwnerIds(ownerIds) {
  if (!ownerIds) return [];
  if (Array.isArray(ownerIds)) return ownerIds;
  return [ownerIds];
}

export default {
  applyOwnerFilter,
  getFirstOwnerId,
  normalizeOwnerIds
};
