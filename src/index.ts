/**
 * @module @heymantle/react-native
 * @description React Native SDK for Mantle billing with store IAP support
 */

// Provider
export { MantleProvider, APPLE_SUBSCRIPTION_MANAGEMENT_URL } from "./MantleProvider";

// Hooks
export { useMantle } from "./hooks/useMantle";
export { useFeature } from "./hooks/useFeature";
export { usePurchase } from "./hooks/usePurchase";

// Types
export type {
  // SDK-specific types
  SimulateEvent,
  StoreEnvironment,
  BillingConfig,
  BillingState,
  PurchaseResult,
  RestoreResult,
  SimulateResult,
  SendUsageEventParams,
  UsageEventResult,
  MantleProviderProps,
  MantleReactNativeContext,
  // Re-exported from @heymantle/client
  Customer,
  Feature,
  MantleClient,
  MantleError,
  Plan,
  Subscription,
  UsageEvent,
} from "./types";
