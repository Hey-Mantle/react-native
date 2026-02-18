import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  purchaseSimulated,
  simulateEventService,
  restoreSimulated,
} from "../services/simulation";
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

describe("purchaseSimulated", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns successful purchase result", async () => {
    const mockSubscription = { id: "sub-1", plan: { name: "Pro" } };
    const mockFeatures = { analytics: { type: "boolean", value: true } };

    mockFetchOk({
      subscription: mockSubscription,
      features: mockFeatures,
    });

    const result = await purchaseSimulated(apiConfig, "plan-1");

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.subscription).toEqual(mockSubscription);
    expect(result.features).toEqual(mockFeatures);
    expect(result.error).toBeUndefined();
  });

  it("returns error on API error response", async () => {
    mockFetchError(404, { error: "Plan not found" });

    const result = await purchaseSimulated(apiConfig, "bad-plan");

    expect(result.success).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.error).toBe("Plan not found");
    expect(result.subscription).toBeNull();
  });

  it("handles fetch errors gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await purchaseSimulated(apiConfig, "plan-1");

    expect(result.success).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.error).toBe("Network error");
  });
});

describe("simulateEventService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns successful simulate result", async () => {
    const mockSubscription = { id: "sub-1" };
    const mockFeatures = {};

    mockFetchOk({
      subscription: mockSubscription,
      features: mockFeatures,
      simulated: true,
      event: "EXPIRED",
    });

    const result = await simulateEventService(apiConfig, "sub-1", "EXPIRED");

    expect(result.success).toBe(true);
    expect(result.event).toBe("EXPIRED");
    expect(result.subscription).toEqual(mockSubscription);
  });

  it("returns error on API error response", async () => {
    mockFetchError(404, { error: "Subscription not found" });

    const result = await simulateEventService(
      apiConfig,
      "bad-sub",
      "DID_RENEW"
    );

    expect(result.success).toBe(false);
    expect(result.event).toBe("DID_RENEW");
    expect(result.error).toBe("Subscription not found");
  });

  it("handles fetch errors gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Timeout"));

    const result = await simulateEventService(apiConfig, "sub-1", "REFUND");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Timeout");
  });
});

describe("restoreSimulated", () => {
  it("returns a successful restore result", async () => {
    const result = await restoreSimulated();

    expect(result.success).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.subscription).toBeNull();
  });
});
