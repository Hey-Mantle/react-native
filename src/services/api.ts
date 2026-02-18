/**
 * @module api
 * @description Thin fetch wrapper for Mantle API endpoints
 */

import type { ApiConfig } from "../types";

interface RequestParams {
  apiConfig: ApiConfig;
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, any>;
}

/**
 * Makes an authenticated request to the Mantle API.
 * Returns an object with an `error` field on non-OK HTTP responses.
 */
export const mantleRequest = async <T = any>({
  apiConfig,
  path,
  method,
  body,
}: RequestParams): Promise<T> => {
  const url = `${apiConfig.apiUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Mantle-App-Id": apiConfig.appId,
      "X-Mantle-Customer-Api-Token": apiConfig.customerApiToken,
    },
    ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    return { error: `Request failed with status ${response.status} (non-JSON response)` } as T;
  }

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    return { error: message } as T;
  }

  return data;
};

/**
 * Verify an Apple purchase with Mantle
 * Real mode: sends transactionId or jwsTransaction
 * Simulation mode: sends { simulated: true, planId }
 */
export const verifyApplePurchase = async (
  apiConfig: ApiConfig,
  params:
    | { simulated: true; planId: string }
    | { transactionId: string }
    | { jwsTransaction: string }
): Promise<{
  subscription?: any;
  features?: Record<string, any>;
  error?: string;
}> => {
  // Validate required fields
  if ("simulated" in params && !params.planId) {
    return { error: "planId is required for simulated purchases" };
  }
  if ("transactionId" in params && !params.transactionId) {
    return { error: "transactionId is required" };
  }
  if ("jwsTransaction" in params && !params.jwsTransaction) {
    return { error: "jwsTransaction is required" };
  }

  return mantleRequest({
    apiConfig,
    path: "/subscriptions/apple/verify",
    method: "POST",
    body: params,
  });
};

/**
 * Restore an Apple subscription with Mantle
 */
export const restoreApplePurchase = async (
  apiConfig: ApiConfig,
  params:
    | { originalTransactionId: string }
    | { transactionId: string }
    | { jwsTransaction: string }
): Promise<{
  subscription?: any;
  features?: Record<string, any>;
  restored?: boolean;
  error?: string;
}> => {
  // Validate required fields
  if ("originalTransactionId" in params && !params.originalTransactionId) {
    return { error: "originalTransactionId is required" };
  }
  if ("transactionId" in params && !params.transactionId) {
    return { error: "transactionId is required" };
  }
  if ("jwsTransaction" in params && !params.jwsTransaction) {
    return { error: "jwsTransaction is required" };
  }

  return mantleRequest({
    apiConfig,
    path: "/subscriptions/apple/restore",
    method: "POST",
    body: params,
  });
};

/**
 * Simulate an Apple lifecycle event
 */
export const simulateAppleEvent = async (
  apiConfig: ApiConfig,
  params: { subscriptionId: string; event: string }
): Promise<{
  subscription?: any;
  features?: Record<string, any>;
  simulated?: boolean;
  event?: string;
  error?: string;
}> => {
  // Validate required fields
  if (!params.subscriptionId) {
    return { error: "subscriptionId is required" };
  }
  if (!params.event) {
    return { error: "event is required" };
  }

  return mantleRequest({
    apiConfig,
    path: "/subscriptions/apple/simulate",
    method: "POST",
    body: params,
  });
};
