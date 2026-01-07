// src/hooks/useEffectiveOwner.js
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to get the effective owner ID(s) for data queries.
 * This considers:
 * 1. Impersonation state (if impersonating, use target user's ID)
 * 2. Scope filter (if filtering by agency/agent, use filtered owner IDs)
 * 3. Default: current user's ID from URL
 *
 * Returns an object with:
 * - ownerId: single owner ID (for backward compatibility) or null
 * - ownerIds: array of owner IDs (for multi-owner queries) or null
 * - isMultiOwner: boolean indicating if multiple owners are being queried
 * - filterKey: string to use in query keys for proper cache invalidation
 */
export function useEffectiveOwner() {
  const { userId } = useParams();
  const { impersonating, scopeFilter, getEffectiveOwnerIds } = useAuth();

  // Get the effective owner IDs from auth context
  const effectiveOwnerIds = getEffectiveOwnerIds();

  // Determine if we're querying multiple owners
  const isMultiOwner = Array.isArray(effectiveOwnerIds);

  // For backward compatibility, provide single ownerId
  // If multiple owners, use the first one (or null)
  const ownerId = isMultiOwner
    ? (effectiveOwnerIds.length > 0 ? effectiveOwnerIds[0] : null)
    : effectiveOwnerIds;

  // Create a unique filter key for query caching
  // This ensures queries are re-fetched when the filter changes
  // IMPORTANT: Priority must match getEffectiveOwnerIds() - impersonation first, then scope filter
  const filterKey = impersonating.active
    ? `impersonate:${impersonating.targetUserId}`
    : scopeFilter.active
      ? `${scopeFilter.filterType}:${scopeFilter.filterValue}`
      : `user:${userId}`;

  return {
    ownerId,
    ownerIds: isMultiOwner ? effectiveOwnerIds : (effectiveOwnerIds ? [effectiveOwnerIds] : []),
    isMultiOwner,
    filterKey,
    // Also expose raw URL userId for cases where we need it
    urlUserId: userId,
  };
}

/**
 * Simple hook for backward compatibility - returns single owner ID
 * Uses URL userId when no filter/impersonation is active
 */
export function useOwnerId() {
  const { ownerId } = useEffectiveOwner();
  return ownerId;
}

export default useEffectiveOwner;
