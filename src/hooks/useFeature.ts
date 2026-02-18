/**
 * @module useFeature
 * @description Convenience hook for feature gating
 */

import { useMantleContext } from "../MantleProvider";

interface UseFeatureResult {
  /** Whether the feature is enabled (boolean) or within limit (limit type) */
  enabled: boolean;
  /** The limit value (-1 if not a limit feature or no limit set) */
  limit: number;
  /** The raw feature value */
  value: any;
}

/**
 * Check if a feature is enabled for the current customer.
 *
 * @param featureKey - The feature key to check
 * @param options - Optional: pass `count` for limit-type features
 * @returns Feature state with enabled, limit, and raw value
 *
 * @example
 * ```tsx
 * // Boolean feature
 * const { enabled } = useFeature('advanced_analytics');
 *
 * // Limit feature
 * const { enabled, limit } = useFeature('api_calls', { count: currentCount });
 *
 * if (!enabled) return <UpgradePrompt />;
 * ```
 */
export const useFeature = (
  featureKey: string,
  options?: { count?: number }
): UseFeatureResult => {
  const { customer } = useMantleContext();
  const feature = customer?.features?.[featureKey];

  if (!feature) {
    return { enabled: false, limit: -1, value: undefined };
  }

  const count = options?.count ?? 0;
  let enabled = false;

  if (feature.type === "boolean") {
    enabled = !!feature.value;
  } else if (feature.type === "limit") {
    enabled = feature.value === -1 || count < feature.value;
  } else if (feature.type === "limit_with_overage") {
    enabled = true; // Always enabled, just charges overage
  }

  return {
    enabled,
    limit:
      feature.type === "limit" || feature.type === "limit_with_overage"
        ? feature.value
        : -1,
    value: feature.value,
  };
};
