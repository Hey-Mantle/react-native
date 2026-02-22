/**
 * @module MantleProvider
 * @description React Native provider for Mantle billing with store IAP support
 */

/** React Native global — true in dev builds, undefined in non-RN environments */
declare const __DEV__: boolean | undefined;

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MantleClient } from "@heymantle/client";
import type { Feature, Subscription } from "@heymantle/client";
import type {
  ApiConfig,
  SimulateEvent,
  BillingState,
  CustomerWithBilling,
  MantleProviderProps,
  MantleReactNativeContext,
  PurchaseResult,
  RestoreResult,
  SimulateResult,
  SendUsageEventParams,
  UsageEventResult,
} from "./types";
import { purchaseSimulated, simulateEventService, restoreSimulated } from "./services/simulation";
import {
  initIAPConnection,
  fetchIAPProducts,
  requestIAPSubscription,
  setupPurchaseListeners,
  verifyAndFinishPurchase,
  restoreReal,
  getRestoredPurchases,
} from "./services/iap";

/** URL to manage Apple subscriptions in iOS Settings */
export const APPLE_SUBSCRIPTION_MANAGEMENT_URL =
  "https://apps.apple.com/account/subscriptions";

/**
 * Lazily resolved reference to react-native's Linking module.
 * Uses an indirect dynamic import to avoid pulling react-native into the
 * DTS build's static dependency graph. react-native is a peer dependency
 * and always available at runtime in React Native apps.
 *
 * Note: The indirect import pattern (via Function constructor) is intentional —
 * a direct `import("react-native")` causes DTS resolution failures since
 * react-native types aren't installed in this package's devDependencies.
 */
const importReactNative = (): Promise<{ Linking: { openURL: (url: string) => Promise<void> } }> =>
  // eslint-disable-next-line no-new-func
  new Function('return import("react-native")')();

/** React Context for Mantle React Native */
const MantleNativeContext = createContext<MantleReactNativeContext | undefined>(
  undefined
);

/**
 * Evaluates whether a feature is enabled based on its type and value
 */
const evaluateFeature = (feature: Feature, count: number = 0): boolean => {
  if (feature?.type === "boolean") {
    return feature.value;
  } else if (feature?.type === "limit") {
    return count < feature.value || feature.value === -1;
  } else if (feature?.type === "limit_with_overage") {
    return true;
  }
  return false;
};

/**
 * MantleProvider initializes the Mantle client, fetches customer data,
 * and provides billing context (store IAP or simulation) to child components.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <MantleProvider appId="your-app-id" customerApiToken={token}>
 *       <YourApp />
 *     </MantleProvider>
 *   );
 * }
 * ```
 */
export const MantleProvider: React.FC<MantleProviderProps> = ({
  appId,
  customerApiToken,
  apiUrl = "https://appapi.heymantle.com/v1",
  children,
  waitForCustomer = false,
  loadingComponent = null,
  simulationMode: simulationModeProp = false,
}) => {
  // Warn loudly if simulation mode is enabled — should never ship to production
  if (simulationModeProp) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[MantleProvider] simulationMode is enabled. " +
          "This bypasses real store purchases. Do NOT ship this to production."
      );
    } else {
      console.error(
        "[MantleProvider] ⚠️ simulationMode is enabled in a non-__DEV__ environment! " +
          "This bypasses real store purchases and should NEVER be used in production."
      );
    }
  }

  const [customer, setCustomer] = useState<CustomerWithBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  const clientRef = useRef<MantleClient | null>(null);
  const entitlementSyncDoneRef = useRef(false);

  // Memoize apiConfig so callbacks don't recreate on every render
  const apiConfig: ApiConfig = useMemo(
    () => ({ apiUrl, appId, customerApiToken }),
    [apiUrl, appId, customerApiToken]
  );

  // Create or update the MantleClient when credentials change
  const clientKeyRef = useRef<string>("");
  const clientKey = `${appId}:${customerApiToken}:${apiUrl}`;
  if (!clientRef.current || clientKeyRef.current !== clientKey) {
    clientRef.current = new MantleClient({ appId, customerApiToken, apiUrl });
    clientKeyRef.current = clientKey;
  }

  const client = clientRef.current;

  // Derive state from customer
  const subscription = (customer?.subscription as Subscription) || null;
  const plans = customer?.plans || [];
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const subscriptionRef = useRef(subscription);
  subscriptionRef.current = subscription;
  const features = customer?.features || {};
  const simulationMode = simulationModeProp;
  const storeEnvironment =
    (subscription as any)?.apple?.environment || null;

  const billing: BillingState = {
    simulationMode,
    environment: storeEnvironment,
  };

  /**
   * Fetches the current customer from Mantle
   */
  const fetchCustomer = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.getCustomer();
      if (result && "error" in result) {
        throw new Error(result.error);
      }
      setCustomer(result as CustomerWithBilling);
    } catch (e) {
      console.error("[MantleProvider] Error fetching customer:", e);
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [client]);

  /**
   * Refetch customer data
   */
  const refetch = useCallback(async () => {
    await fetchCustomer();
  }, [fetchCustomer]);

  /** How long to wait for the store to respond before timing out (ms) */
  const PURCHASE_TIMEOUT_MS = 60_000;

  // Ref to hold a promise resolver for real-mode purchases.
  // The purchaseUpdatedListener resolves this when verification completes.
  const purchaseResolverRef = useRef<{
    resolve: (result: PurchaseResult) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  /**
   * Resolve the pending purchase promise (if any), clearing its timeout.
   */
  const resolvePurchase = useCallback((result: PurchaseResult) => {
    if (purchaseResolverRef.current) {
      clearTimeout(purchaseResolverRef.current.timeoutId);
      purchaseResolverRef.current.resolve(result);
      purchaseResolverRef.current = null;
    }
  }, []);

  /**
   * Purchase a plan by ID.
   *
   * Routing logic:
   * - Simulation mode → Mantle verify endpoint with { simulated: true }
   * - Free plan (no storeProductId) → Mantle subscribe endpoint directly
   * - Paid plan → Store IAP (StoreKit/Google Play), then verified through Mantle
   */
  const purchase = useCallback(
    async (planId: string): Promise<PurchaseResult> => {
      setPurchasing(true);
      setError(null);

      try {
        if (simulationMode) {
          const result = await purchaseSimulated(apiConfig, planId);
          await refetch();
          setPurchasing(false);
          return result;
        }

        const plan = plans.find((p) => p.id === planId);
        if (!plan) {
          throw new Error(`Plan "${planId}" not found`);
        }

        const storeProductId = (plan as any).appleProductId;

        if (!storeProductId) {
          // Free plan with an active store subscription — the user must cancel
          // their store subscription first. We cannot create a free subscription
          // while a store subscription is still active because store subscriptions
          // can't be cancelled programmatically, and creating a second subscription
          // would leave the user in an inconsistent state (still being charged by
          // the store while on a free plan in Mantle).
          const hasStoreSubscription =
            !!subscription?.id &&
            !!(subscription as any)?.apple?.originalTransactionId;

          if (hasStoreSubscription) {
            setPurchasing(false);
            return {
              success: false,
              subscription: null,
              features: {},
              simulated: false,
              storeCancelRequired: true,
              error:
                "Please cancel your current subscription in your device's subscription settings before switching to a free plan.",
            };
          }

          // No active store subscription — safe to subscribe to the free plan
          const result = await client.subscribe({ planId, billingProvider: "apple" });
          await refetch();
          setPurchasing(false);

          if (result && "error" in result) {
            return {
              success: false,
              subscription: null,
              features: {},
              simulated: false,
              error: result.error,
            };
          }

          return {
            success: true,
            subscription: result as any,
            features: {},
            simulated: false,
          };
        }

        // Paid plan — go through store IAP
        // Create a promise that the purchaseUpdatedListener will resolve.
        // Includes a timeout so the caller isn't left hanging if the listener
        // never fires (e.g. network failure, app backgrounded).
        const resultPromise = new Promise<PurchaseResult>((resolve) => {
          const timeoutId = setTimeout(() => {
            if (purchaseResolverRef.current) {
              purchaseResolverRef.current = null;
              setPurchasing(false);
              resolve({
                success: false,
                subscription: null,
                features: {},
                simulated: false,
                error: "Purchase timed out. Please check your subscription status and try again.",
              });
            }
          }, PURCHASE_TIMEOUT_MS);

          purchaseResolverRef.current = { resolve, timeoutId };
        });

        // Request the purchase — store shows the payment sheet
        await requestIAPSubscription(storeProductId);

        // Wait for the listener to verify and return the actual result
        const result = await resultPromise;
        return result;
      } catch (e) {
        const err = e as Error;
        setError(err);
        setPurchasing(false);
        return {
          success: false,
          subscription: null,
          features: {},
          simulated: simulationMode,
          error: err.message,
        };
      }
    },
    [simulationMode, apiConfig, plans, client, refetch, resolvePurchase]
  );

  /**
   * Restore purchases
   */
  const restore = useCallback(async (): Promise<RestoreResult> => {
    setRestoring(true);
    setError(null);

    try {
      if (simulationMode) {
        const result = await restoreSimulated();
        await refetch();
        return result;
      } else {
        const result = await restoreReal(apiConfig);
        if (result.success) {
          await refetch();
        }
        return result;
      }
    } catch (e) {
      const err = e as Error;
      setError(err);
      return {
        success: false,
        subscription: null,
        features: {},
        restored: false,
        error: err.message,
      };
    } finally {
      setRestoring(false);
    }
  }, [simulationMode, apiConfig, refetch]);

  /**
   * Cancel the current subscription.
   * Uses the MantleClient's built-in cancelSubscription method.
   */
  const cancelSub = useCallback(
    async (reason?: string) => {
      const result = await client.cancelSubscription({
        ...(reason ? { cancelReason: reason } : {}),
      });
      await refetch();
      return result;
    },
    [client, refetch]
  );

  /**
   * Simulate a lifecycle event (simulation mode only)
   */
  const simulateEvent = useCallback(
    async (event: SimulateEvent): Promise<SimulateResult> => {
      if (!simulationMode) {
        throw new Error("simulateEvent is only available in simulation mode");
      }

      if (!subscription?.id) {
        throw new Error("No active subscription to simulate events on");
      }

      const result = await simulateEventService(
        apiConfig,
        subscription.id,
        event
      );
      await refetch();
      return result;
    },
    [simulationMode, subscription, apiConfig, refetch]
  );

  /**
   * Send a usage event to track metered usage
   */
  const sendUsageEvent = useCallback(
    async (params: SendUsageEventParams): Promise<UsageEventResult> => {
      try {
        const result = await client.sendUsageEvent(params);
        if (result && "error" in result) {
          return { success: false, error: result.error };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
    [client]
  );

  /**
   * Send multiple usage events
   */
  const sendUsageEvents = useCallback(
    async (events: SendUsageEventParams[]): Promise<UsageEventResult> => {
      if (!customer?.id) {
        return { success: false, error: "No customer loaded" };
      }
      try {
        const result = await client.sendUsageEvents({
          events: events.map((e) => ({
            ...e,
            customerId: customer.id,
            properties: e.properties ?? {},
          })),
        });
        if (result && "error" in result) {
          return { success: false, error: result.error };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
    [client, customer]
  );

  /**
   * Open the platform's subscription management page.
   * Currently opens the Apple subscription management URL.
   * Will support Google Play when added.
   */
  const openSubscriptionManagement = useCallback(async () => {
    const RN = await importReactNative();
    await RN.Linking.openURL(APPLE_SUBSCRIPTION_MANAGEMENT_URL);
  }, []);

  /**
   * Check if a feature is enabled
   */
  const isFeatureEnabled = useCallback(
    (featureKey: string, count?: number): boolean => {
      const feature = features[featureKey];
      if (!feature) return false;
      return evaluateFeature(feature, count);
    },
    [features]
  );

  /**
   * Get the limit for a feature
   */
  const limitForFeature = useCallback(
    (featureKey: string): number => {
      const feature = features[featureKey];
      if (feature && (feature.type === "limit" || feature.type === "limit_with_overage")) {
        return feature.value;
      }
      return -1;
    },
    [features]
  );

  // Reset entitlement sync when user changes (different token = different user)
  useEffect(() => {
    entitlementSyncDoneRef.current = false;
  }, [customerApiToken]);

  // Fetch customer on mount and when token changes
  useEffect(() => {
    if (customerApiToken) {
      fetchCustomer();
    }
  }, [customerApiToken]);

  // Stable key for IAP init — only re-initialize when the customer identity
  // or billing mode actually changes, not on every refetch.
  const customerId = customer?.id ?? null;

  // Initialize IAP connection in real mode
  useEffect(() => {
    if (customerId && !simulationMode) {
      let cancelled = false;

      const init = async () => {
        try {
          const endConnection = await initIAPConnection();

          // Fetch products from the store so they're available for purchase
          const storeProductIds = plansRef.current
            .map((p: any) => p.appleProductId)
            .filter(Boolean);
          if (storeProductIds.length > 0) {
            await fetchIAPProducts(storeProductIds);
          }

          const removeListeners = await setupPurchaseListeners(
            async (iapPurchase) => {
              if (cancelled) return;
              // If the purchase already timed out, the resolver is null.
              // Still verify & finish the transaction with Apple so it doesn't
              // linger, but skip state updates to avoid stale setState calls.
              const hasResolver = !!purchaseResolverRef.current;
              try {
                const result = await verifyAndFinishPurchase(apiConfig, iapPurchase);
                if (hasResolver) {
                  await refetch();
                  resolvePurchase(result);
                }
              } catch (e) {
                if (hasResolver) {
                  resolvePurchase({
                    success: false,
                    subscription: null,
                    features: {},
                    simulated: false,
                    error: (e as Error).message,
                  });
                }
              } finally {
                if (hasResolver) {
                  setPurchasing(false);
                }
              }
            },
            async (iapError) => {
              if (cancelled) return;

              // User dismissed the payment sheet — not an error
              if (
                iapError?.code === "E_USER_CANCELLED" ||
                iapError?.code === "E_USER_CANCELED"
              ) {
                resolvePurchase({
                  success: false,
                  subscription: null,
                  features: {},
                  simulated: false,
                  error: undefined,
                });
                setPurchasing(false);
                return;
              }

              // If user already owns this subscription, restore it
              if (iapError?.code === "already-owned") {
                try {
                  await restoreReal(apiConfig);
                  await refetch();
                  resolvePurchase({
                    success: true,
                    subscription: null,
                    features: {},
                    simulated: false,
                  });
                } catch (e) {
                  resolvePurchase({
                    success: false,
                    subscription: null,
                    features: {},
                    simulated: false,
                    error: (e as Error).message,
                  });
                }
                setPurchasing(false);
                return;
              }

              const err =
                iapError instanceof Error
                  ? iapError
                  : new Error(iapError?.message || "IAP error");
              setError(err);
              resolvePurchase({
                success: false,
                subscription: null,
                features: {},
                simulated: false,
                error: err.message,
              });
              setPurchasing(false);
            }
          );

          cleanupRef.current = () => {
            removeListeners();
            endConnection();
          };

          // Sync store entitlements with Mantle on startup (once per session).
          // If the store has a subscription but Mantle doesn't, restore it.
          if (!cancelled && !entitlementSyncDoneRef.current) {
            entitlementSyncDoneRef.current = true;
            try {
              const storePurchases = await getRestoredPurchases();
              const hasStoreSub = storePurchases.length > 0;
              const hasMantleSub = !!subscriptionRef.current?.id;

              if (hasStoreSub && !hasMantleSub) {
                const result = await restoreReal(apiConfig);
                if (result.success) {
                  await refetch();
                }
              }
            } catch (e) {
              // Non-fatal — entitlement sync is best-effort
            }
          }
        } catch (e) {
          console.warn(
            "[MantleProvider] Failed to initialize IAP:",
            (e as Error).message
          );
        }
      };

      init();

      return () => {
        cancelled = true;
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }
  }, [customerId, simulationMode]);

  if (waitForCustomer && loading) {
    return <>{loadingComponent}</>;
  }

  return (
    <MantleNativeContext.Provider
      value={{
        client,
        customer,
        subscription,
        plans,
        features,
        loading,
        billing,
        purchase,
        restore,
        cancelSubscription: cancelSub,
        simulateEvent,
        sendUsageEvent,
        sendUsageEvents,
        openSubscriptionManagement,
        refetch,
        isFeatureEnabled,
        limitForFeature,
        purchasing,
        restoring,
        error,
      }}
    >
      {children}
    </MantleNativeContext.Provider>
  );
};

/**
 * Internal context access — used by hooks
 */
export const useMantleContext = (): MantleReactNativeContext => {
  const context = useContext(MantleNativeContext);
  if (!context) {
    throw new Error("useMantle must be used within a MantleProvider");
  }
  return context;
};
