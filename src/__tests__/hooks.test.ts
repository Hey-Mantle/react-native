import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { useFeature } from "../hooks/useFeature";
import { useMantle } from "../hooks/useMantle";
import { usePurchase } from "../hooks/usePurchase";
import type { MantleReactNativeContext } from "../types";

// Mock the MantleProvider context
const mockContext: MantleReactNativeContext = {
  client: {} as any,
  customer: {
    id: "cust-1",
    test: false,
    plans: [],
    features: {
      analytics: { id: "f1", key: "analytics", type: "boolean", value: true } as any,
      api_calls: { id: "f2", key: "api_calls", type: "limit", value: 100 } as any,
      unlimited: { id: "f3", key: "unlimited", type: "limit", value: -1 } as any,
      overage: { id: "f4", key: "overage", type: "limit_with_overage", value: 50 } as any,
    },
    usage: {},
    usageCredits: [],
    reviews: [],
    billingStatus: "active",
  },
  subscription: { id: "sub-1" } as any,
  plans: [],
  features: {
    analytics: { id: "f1", key: "analytics", type: "boolean", value: true } as any,
    api_calls: { id: "f2", key: "api_calls", type: "limit", value: 100 } as any,
    unlimited: { id: "f3", key: "unlimited", type: "limit", value: -1 } as any,
    overage: { id: "f4", key: "overage", type: "limit_with_overage", value: 50 } as any,
  },
  loading: false,
  billing: { simulationMode: true, environment: "Simulated" },
  purchase: vi.fn().mockResolvedValue({
    success: true,
    subscription: null,
    features: {},
    simulated: true,
  }),
  restore: vi.fn().mockResolvedValue({
    success: true,
    subscription: null,
    features: {},
    restored: true,
  }),
  cancelSubscription: vi.fn(),
  simulateEvent: vi.fn(),
  openSubscriptionManagement: vi.fn(),
  refetch: vi.fn(),
  isFeatureEnabled: vi.fn(),
  limitForFeature: vi.fn(),
  purchasing: false,
  restoring: false,
  error: null,
};

// Mock the context module
vi.mock("../MantleProvider", () => ({
  useMantleContext: () => mockContext,
}));

describe("useMantle", () => {
  it("returns the full context", () => {
    const { result } = renderHook(() => useMantle());
    expect(result.current.customer).toBeDefined();
    expect(result.current.billing.simulationMode).toBe(true);
    expect(result.current.purchase).toBeDefined();
    expect(result.current.restore).toBeDefined();
  });
});

describe("useFeature", () => {
  it("evaluates boolean feature as enabled", () => {
    const { result } = renderHook(() => useFeature("analytics"));
    expect(result.current.enabled).toBe(true);
    expect(result.current.limit).toBe(-1);
    expect(result.current.value).toBe(true);
  });

  it("evaluates limit feature within limit", () => {
    const { result } = renderHook(() =>
      useFeature("api_calls", { count: 50 })
    );
    expect(result.current.enabled).toBe(true);
    expect(result.current.limit).toBe(100);
  });

  it("evaluates limit feature exceeding limit", () => {
    const { result } = renderHook(() =>
      useFeature("api_calls", { count: 150 })
    );
    expect(result.current.enabled).toBe(false);
    expect(result.current.limit).toBe(100);
  });

  it("evaluates unlimited feature (-1)", () => {
    const { result } = renderHook(() =>
      useFeature("unlimited", { count: 999999 })
    );
    expect(result.current.enabled).toBe(true);
    expect(result.current.limit).toBe(-1);
    expect(result.current.value).toBe(-1);
  });

  it("evaluates limit_with_overage as always enabled", () => {
    const { result } = renderHook(() =>
      useFeature("overage", { count: 999 })
    );
    expect(result.current.enabled).toBe(true);
    expect(result.current.limit).toBe(50);
  });

  it("returns disabled for missing feature", () => {
    const { result } = renderHook(() => useFeature("nonexistent"));
    expect(result.current.enabled).toBe(false);
    expect(result.current.limit).toBe(-1);
    expect(result.current.value).toBeUndefined();
  });
});

describe("usePurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns purchase and restore functions", () => {
    const { result } = renderHook(() => usePurchase());
    expect(typeof result.current.purchase).toBe("function");
    expect(typeof result.current.restore).toBe("function");
    expect(typeof result.current.clearError).toBe("function");
    expect(result.current.purchasing).toBe(false);
    expect(result.current.restoring).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.simulationMode).toBe(true);
  });

  it("delegates purchase to context and returns result", async () => {
    const { result } = renderHook(() => usePurchase());

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("plan-1");
    });

    expect(mockContext.purchase).toHaveBeenCalledWith("plan-1");
    expect(purchaseResult.success).toBe(true);
    expect(purchaseResult.simulated).toBe(true);
  });

  it("delegates restore to context and returns result", async () => {
    const { result } = renderHook(() => usePurchase());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore();
    });

    expect(mockContext.restore).toHaveBeenCalled();
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restored).toBe(true);
  });

  it("sets error state when purchase throws and re-throws", async () => {
    const purchaseError = new Error("Purchase failed");
    (mockContext.purchase as any).mockRejectedValueOnce(purchaseError);

    const { result } = renderHook(() => usePurchase());

    let thrownError: Error | undefined;
    await act(async () => {
      try {
        await result.current.purchase("plan-1");
      } catch (e) {
        thrownError = e as Error;
      }
    });

    expect(thrownError?.message).toBe("Purchase failed");
    expect(result.current.error?.message).toBe("Purchase failed");
    expect(result.current.purchasing).toBe(false);
  });

  it("sets error state when restore throws and re-throws", async () => {
    const restoreError = new Error("Restore failed");
    (mockContext.restore as any).mockRejectedValueOnce(restoreError);

    const { result } = renderHook(() => usePurchase());

    let thrownError: Error | undefined;
    await act(async () => {
      try {
        await result.current.restore();
      } catch (e) {
        thrownError = e as Error;
      }
    });

    expect(thrownError?.message).toBe("Restore failed");
    expect(result.current.error?.message).toBe("Restore failed");
    expect(result.current.restoring).toBe(false);
  });

  it("clearError resets error state", async () => {
    (mockContext.purchase as any).mockRejectedValueOnce(new Error("Failed"));

    const { result } = renderHook(() => usePurchase());

    await act(async () => {
      try {
        await result.current.purchase("plan-1");
      } catch {}
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
