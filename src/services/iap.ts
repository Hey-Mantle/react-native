/**
 * @module iap
 * @description Wrapper for react-native-iap
 */

import type { ApiConfig, PurchaseResult, RestoreResult } from "../types";
import { verifyApplePurchase, restoreApplePurchase } from "./api";
import * as RNIap from "react-native-iap";

/**
 * Initialize the IAP connection. Returns a cleanup function to end the connection.
 */
export const initIAPConnection = async (): Promise<() => void> => {
  await RNIap.initConnection();

  return () => {
    RNIap.endConnection();
  };
};

/**
 * Fetch products from StoreKit. Must be called before requestPurchase.
 * Returns the fetched products.
 */
export const fetchIAPProducts = async (
  skus: string[]
): Promise<any[]> => {
  if (!skus.length) return [];
  return await RNIap.fetchProducts({ skus, type: "subs" });
};

/**
 * Sets up purchase and error listeners.
 * Returns a cleanup function to remove the listeners.
 */
export const setupPurchaseListeners = async (
  onPurchase: (purchase: any) => Promise<void>,
  onError: (error: any) => void
): Promise<() => void> => {
  const purchaseSubscription = RNIap.purchaseUpdatedListener(
    async (purchase: any) => {
      try {
        await onPurchase(purchase);
      } catch (e) {
        onError(e);
      }
    }
  );

  const errorSubscription = RNIap.purchaseErrorListener((error: any) => {
    onError(error);
  });

  return () => {
    purchaseSubscription?.remove?.();
    errorSubscription?.remove?.();
  };
};

/**
 * Request an IAP subscription for a given Apple product ID.
 * The actual result comes through the purchaseUpdatedListener.
 * Products must be fetched via fetchIAPProducts before calling this.
 */
export const requestIAPSubscription = async (
  appleProductId: string
): Promise<void> => {
  await RNIap.requestPurchase({
    request: { apple: { sku: appleProductId } },
    type: "subs",
  });
};

/**
 * Finish an IAP transaction with Apple (must be called after successful verification)
 */
export const finishIAPTransaction = async (purchase: any): Promise<void> => {
  await RNIap.finishTransaction({ purchase, isConsumable: false });
};

/**
 * Verify a real purchase with Mantle, finish the transaction, then return the result.
 *
 * In react-native-iap v14 (StoreKit 2), the JWS signed transaction is in `purchaseToken`.
 * We prefer sending jwsTransaction to Mantle — it can be verified locally without calling
 * Apple's API and works in all environments (Xcode testing, Sandbox, Production).
 * Falls back to transactionId for compatibility.
 */
export const verifyAndFinishPurchase = async (
  apiConfig: ApiConfig,
  purchase: any
): Promise<PurchaseResult> => {
  try {
    const jwsTransaction = purchase.purchaseToken;
    const transactionId = purchase.transactionId;

    const params = jwsTransaction
      ? { jwsTransaction }
      : { transactionId: transactionId || purchase.transactionReceipt };

    const result = await verifyApplePurchase(apiConfig, params);

    if (result.error) {
      return {
        success: false,
        subscription: null,
        features: {},
        simulated: false,
        error: result.error,
      };
    }

    // Finish transaction with Apple after successful Mantle verification
    await finishIAPTransaction(purchase);

    return {
      success: true,
      subscription: result.subscription || null,
      features: result.features || {},
      simulated: false,
    };
  } catch (e) {
    return {
      success: false,
      subscription: null,
      features: {},
      simulated: false,
      error: (e as Error).message,
    };
  }
};

/**
 * Get available purchases for restore, sorted by most recent
 */
export const getRestoredPurchases = async (): Promise<any[]> => {
  const purchases = await RNIap.getAvailablePurchases();

  return purchases
    .filter((p: any) => p.productId)
    .sort(
      (a: any, b: any) => (b.transactionDate || 0) - (a.transactionDate || 0)
    );
};

/**
 * Restore purchases through react-native-iap and Mantle.
 * Prefers JWS transaction (purchaseToken) for StoreKit 2 compatibility.
 */
export const restoreReal = async (
  apiConfig: ApiConfig
): Promise<RestoreResult> => {
  try {
    const purchases = await getRestoredPurchases();

    if (purchases.length === 0) {
      return {
        success: false,
        subscription: null,
        features: {},
        restored: false,
        error: "No purchases found",
      };
    }

    const latestPurchase = purchases[0];

    const jwsTransaction = latestPurchase.purchaseToken;
    const params = jwsTransaction
      ? { jwsTransaction }
      : { originalTransactionId: latestPurchase.transactionId };

    const result = await restoreApplePurchase(apiConfig, params);

    if (result.error) {
      return {
        success: false,
        subscription: null,
        features: {},
        restored: false,
        error: result.error,
      };
    }

    return {
      success: true,
      subscription: result.subscription || null,
      features: result.features || {},
      restored: true,
    };
  } catch (e) {
    return {
      success: false,
      subscription: null,
      features: {},
      restored: false,
      error: (e as Error).message,
    };
  }
};
