/**
 * @module simulation
 * @description Simulated purchase service for testing without store credentials
 */

import type {
  ApiConfig,
  SimulateEvent,
  PurchaseResult,
  RestoreResult,
  SimulateResult,
} from "../types";
import { verifyApplePurchase, simulateAppleEvent } from "./api";

/**
 * Simulates a purchase by calling the verify endpoint with simulated: true
 */
export const purchaseSimulated = async (
  apiConfig: ApiConfig,
  planId: string
): Promise<PurchaseResult> => {
  try {
    const result = await verifyApplePurchase(apiConfig, {
      simulated: true,
      planId,
    });

    if (result.error) {
      return {
        success: false,
        subscription: null,
        features: {},
        simulated: true,
        error: result.error,
      };
    }

    return {
      success: true,
      subscription: result.subscription || null,
      features: result.features || {},
      simulated: true,
    };
  } catch (e) {
    return {
      success: false,
      subscription: null,
      features: {},
      simulated: true,
      error: (e as Error).message,
    };
  }
};

/**
 * Simulates a lifecycle event on an existing subscription
 */
export const simulateEventService = async (
  apiConfig: ApiConfig,
  subscriptionId: string,
  event: SimulateEvent
): Promise<SimulateResult> => {
  try {
    const result = await simulateAppleEvent(apiConfig, {
      subscriptionId,
      event,
    });

    if (result.error) {
      return {
        success: false,
        subscription: null,
        features: {},
        event,
        error: result.error,
      };
    }

    return {
      success: true,
      subscription: result.subscription || null,
      features: result.features || {},
      event,
    };
  } catch (e) {
    return {
      success: false,
      subscription: null,
      features: {},
      event,
      error: (e as Error).message,
    };
  }
};

/**
 * Restores a simulated subscription — in simulation mode the subscription
 * is already stored server-side, so we just return a success indicator.
 * The caller should refetch customer data after this.
 */
export const restoreSimulated = async (): Promise<RestoreResult> => {
  return {
    success: true,
    subscription: null,
    features: {},
    restored: true,
  };
};
