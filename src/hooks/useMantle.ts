/**
 * @module useMantle
 * @description Core hook for accessing Mantle billing context
 */

import type { MantleReactNativeContext } from "../types";
import { useMantleContext } from "../MantleProvider";

/**
 * Access the full Mantle billing context including customer, plans,
 * subscription, billing state, purchase/restore actions, and feature helpers.
 *
 * Must be used within a MantleProvider.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { customer, plans, purchase, billing } = useMantle();
 *   // ...
 * }
 * ```
 */
export const useMantle = (): MantleReactNativeContext => {
  return useMantleContext();
};
