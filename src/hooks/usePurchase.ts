/**
 * @module usePurchase
 * @description Low-level hook for purchase and restore with local state tracking
 */

import { useState } from "react";
import { useMantleContext } from "../MantleProvider";
import type { PurchaseResult, RestoreResult } from "../types";

interface UsePurchaseResult {
  /** Purchase a plan by ID */
  purchase: (planId: string) => Promise<PurchaseResult>;
  /** Restore previous purchases */
  restore: () => Promise<RestoreResult>;
  /** Whether a purchase is in flight */
  purchasing: boolean;
  /** Whether a restore is in flight */
  restoring: boolean;
  /** Last error from purchase or restore */
  error: Error | null;
  /** Clear the last error */
  clearError: () => void;
  /** Whether we are in simulation mode */
  simulationMode: boolean;
}

/**
 * Low-level purchase hook with local state tracking for purchasing/restoring/error.
 * Use this if you need more control than `useMantle().purchase`.
 *
 * @example
 * ```tsx
 * function SubscriptionScreen() {
 *   const { purchase, restore, purchasing, restoring, error } = usePurchase();
 *   return (
 *     <View>
 *       <Button
 *         title={purchasing ? 'Processing...' : 'Subscribe'}
 *         disabled={purchasing}
 *         onPress={() => purchase(planId)}
 *       />
 *       <Button
 *         title={restoring ? 'Restoring...' : 'Restore'}
 *         disabled={restoring}
 *         onPress={restore}
 *       />
 *       {error && <Text>{error.message}</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
export const usePurchase = (): UsePurchaseResult => {
  const context = useMantleContext();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const purchase = async (planId: string): Promise<PurchaseResult> => {
    setPurchasing(true);
    setError(null);
    try {
      return await context.purchase(planId);
    } catch (e) {
      const err = e as Error;
      setError(err);
      throw err;
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async (): Promise<RestoreResult> => {
    setRestoring(true);
    setError(null);
    try {
      return await context.restore();
    } catch (e) {
      const err = e as Error;
      setError(err);
      throw err;
    } finally {
      setRestoring(false);
    }
  };

  return {
    purchase,
    restore,
    purchasing,
    restoring,
    error,
    clearError: () => setError(null),
    simulationMode: context.billing.simulationMode,
  };
};
