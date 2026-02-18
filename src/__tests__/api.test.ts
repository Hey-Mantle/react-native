import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mantleRequest,
  verifyApplePurchase,
  restoreApplePurchase,
  simulateAppleEvent,
} from "../services/api";
import type { ApiConfig } from "../types";

const apiConfig: ApiConfig = {
  apiUrl: "https://appapi.heymantle.com/v1",
  appId: "test-app-id",
  customerApiToken: "test-token",
};

const mockFetchOk = (data: any) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
};

const mockFetchError = (status: number, data: any) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(data),
  });
};

describe("mantleRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct headers and method for POST", async () => {
    const mockResponse = { subscription: { id: "sub-1" } };
    mockFetchOk(mockResponse);

    const result = await mantleRequest({
      apiConfig,
      path: "/subscriptions/apple/verify",
      method: "POST",
      body: { simulated: true, planId: "plan-1" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://appapi.heymantle.com/v1/subscriptions/apple/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Mantle-App-Id": "test-app-id",
          "X-Mantle-Customer-Api-Token": "test-token",
        },
        body: JSON.stringify({ simulated: true, planId: "plan-1" }),
      }
    );

    expect(result).toEqual(mockResponse);
  });

  it("sends GET requests without body", async () => {
    mockFetchOk({ customer: {} });

    await mantleRequest({
      apiConfig,
      path: "/customer",
      method: "GET",
    });

    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
  });

  it("handles path without leading slash", async () => {
    mockFetchOk({});

    await mantleRequest({
      apiConfig,
      path: "subscriptions/apple/verify",
      method: "POST",
      body: {},
    });

    const [url] = (fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://appapi.heymantle.com/v1/subscriptions/apple/verify"
    );
  });

  it("returns error object on non-OK HTTP response", async () => {
    mockFetchError(404, { error: "Plan not found" });

    const result = await mantleRequest({
      apiConfig,
      path: "/subscriptions/apple/verify",
      method: "POST",
      body: { simulated: true, planId: "bad" },
    });

    expect(result).toEqual({ error: "Plan not found" });
  });

  it("sends DELETE requests without body", async () => {
    mockFetchOk({});

    await mantleRequest({
      apiConfig,
      path: "/subscriptions",
      method: "DELETE",
    });

    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/subscriptions");
    expect(options.method).toBe("DELETE");
    expect(options.body).toBeUndefined();
  });

  it("returns generic error when response has no error field", async () => {
    mockFetchError(500, {});

    const result = await mantleRequest({
      apiConfig,
      path: "/subscriptions/apple/verify",
      method: "POST",
      body: {},
    });

    expect(result).toEqual({ error: "Request failed with status 500" });
  });
});

describe("verifyApplePurchase", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends simulated purchase request", async () => {
    const mockResult = {
      subscription: { id: "sub-1" },
      features: { analytics: { type: "boolean", value: true } },
    };
    mockFetchOk(mockResult);

    const result = await verifyApplePurchase(apiConfig, {
      simulated: true,
      planId: "plan-1",
    });

    expect(result).toEqual(mockResult);
    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      simulated: true,
      planId: "plan-1",
    });
  });

  it("sends real transaction verification", async () => {
    mockFetchOk({ subscription: {} });

    await verifyApplePurchase(apiConfig, { transactionId: "txn-123" });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ transactionId: "txn-123" });
  });

  it("sends JWS transaction verification", async () => {
    mockFetchOk({ subscription: {} });

    await verifyApplePurchase(apiConfig, { jwsTransaction: "eyJhbGciOi..." });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ jwsTransaction: "eyJhbGciOi..." });
  });
});

describe("restoreApplePurchase", () => {
  it("sends restore request", async () => {
    const mockResult = { subscription: {}, restored: true };
    mockFetchOk(mockResult);

    const result = await restoreApplePurchase(apiConfig, {
      originalTransactionId: "orig-txn-1",
    });

    expect(result).toEqual(mockResult);
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/subscriptions/apple/restore");
    expect(JSON.parse(options.body)).toEqual({
      originalTransactionId: "orig-txn-1",
    });
  });
});

describe("simulateAppleEvent", () => {
  it("sends simulate event request", async () => {
    const mockResult = {
      subscription: {},
      simulated: true,
      event: "DID_RENEW",
    };
    mockFetchOk(mockResult);

    const result = await simulateAppleEvent(apiConfig, {
      subscriptionId: "sub-1",
      event: "DID_RENEW",
    });

    expect(result).toEqual(mockResult);
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/subscriptions/apple/simulate");
    expect(JSON.parse(options.body)).toEqual({
      subscriptionId: "sub-1",
      event: "DID_RENEW",
    });
  });
});
