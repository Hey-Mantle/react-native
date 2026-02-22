import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor, render, screen } from "@testing-library/react";
import { MantleProvider, useMantleContext } from "../MantleProvider";
import { useMantle } from "../hooks/useMantle";

// Mock MantleClient
const mockGetCustomer = vi.fn();
const mockCancelSubscription = vi.fn().mockResolvedValue({ id: "sub-1" });
const mockSubscribe = vi.fn().mockResolvedValue({ id: "sub-free" });
const mockSendUsageEvent = vi.fn().mockResolvedValue({ success: true });
const mockSendUsageEvents = vi.fn().mockResolvedValue({ success: true });

vi.mock("@heymantle/client", () => ({
  MantleClient: vi.fn().mockImplementation(() => ({
    getCustomer: mockGetCustomer,
    cancelSubscription: mockCancelSubscription,
    subscribe: mockSubscribe,
    sendUsageEvent: mockSendUsageEvent,
    sendUsageEvents: mockSendUsageEvents,
  })),
}));

// Capture IAP listener callbacks so tests can invoke them
let capturedOnPurchase: ((purchase: any) => Promise<void>) | null = null;
let capturedOnError: ((error: any) => void) | null = null;

const {
  mockVerifyAndFinishPurchase,
  mockRestoreReal,
  mockGetRestoredPurchases,
} = vi.hoisted(() => ({
  mockVerifyAndFinishPurchase: vi.fn(),
  mockRestoreReal: vi.fn(),
  mockGetRestoredPurchases: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/iap", () => ({
  initIAPConnection: vi.fn().mockResolvedValue(() => {}),
  fetchIAPProducts: vi.fn().mockResolvedValue([]),
  setupPurchaseListeners: vi.fn().mockImplementation(async (onPurchase: any, onError: any) => {
    capturedOnPurchase = onPurchase;
    capturedOnError = onError;
    return () => {};
  }),
  requestIAPSubscription: vi.fn(),
  verifyAndFinishPurchase: mockVerifyAndFinishPurchase,
  restoreReal: mockRestoreReal,
  getRestoredPurchases: mockGetRestoredPurchases,
}));

const createWrapper =
  (props?: Partial<React.ComponentProps<typeof MantleProvider>>) =>
  ({ children }: { children: React.ReactNode }) =>
    (
      <MantleProvider
        appId="test-app"
        customerApiToken="test-token"
        {...props}
      >
        {children}
      </MantleProvider>
    );

const createSimulationWrapper =
  (props?: Partial<React.ComponentProps<typeof MantleProvider>>) =>
  ({ children }: { children: React.ReactNode }) =>
    (
      <MantleProvider
        appId="test-app"
        customerApiToken="test-token"
        simulationMode={true}
        {...props}
      >
        {children}
      </MantleProvider>
    );

describe("MantleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches customer on mount and provides context", async () => {
    const mockCustomer = {
      id: "cust-1",
      test: false,
      plans: [{ id: "plan-1", name: "Pro" }],
      subscription: { id: "sub-1" },
      features: {
        analytics: { id: "f1", key: "analytics", type: "boolean", value: true },
      },
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    };

    mockGetCustomer.mockResolvedValue(mockCustomer);

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.customer).toEqual(mockCustomer);
    expect(result.current.plans).toHaveLength(1);
    expect(result.current.subscription).toEqual({ id: "sub-1" });
    // simulationMode defaults to false even when apple.configured is false
    expect(result.current.billing.simulationMode).toBe(false);
  });

  it("simulation mode must be explicitly enabled via prop", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    // Without simulationMode prop — defaults to false
    const { result: realResult } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(realResult.current.loading).toBe(false);
    });

    expect(realResult.current.billing.simulationMode).toBe(false);

    // With simulationMode prop — explicitly enabled
    const { result: simResult } = renderHook(() => useMantle(), {
      wrapper: createSimulationWrapper(),
    });

    await waitFor(() => {
      expect(simResult.current.loading).toBe(false);
    });

    expect(simResult.current.billing.simulationMode).toBe(true);
  });

  it("handles customer fetch error gracefully", async () => {
    mockGetCustomer.mockResolvedValue({ error: "Unauthorized" });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.customer).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("purchase works in simulation mode", async () => {
    const mockSubscription = { id: "sub-1" };
    const mockFeatures = { analytics: { type: "boolean", value: true } };

    mockGetCustomer
      .mockResolvedValueOnce({
        id: "cust-1",
        test: false,
        plans: [{ id: "plan-1", name: "Pro" }],
        features: {},
        usage: {},
        usageCredits: [],
        reviews: [],
        billingStatus: "none",
        apple: { configured: false },
      })
      .mockResolvedValue({
        id: "cust-1",
        test: false,
        plans: [{ id: "plan-1", name: "Pro" }],
        subscription: mockSubscription,
        features: mockFeatures,
        usage: {},
        usageCredits: [],
        reviews: [],
        billingStatus: "active",
        apple: { configured: false },
      });

    // Mock the verify endpoint for simulation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          subscription: mockSubscription,
          features: mockFeatures,
        }),
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createSimulationWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("plan-1");
    });

    expect(purchaseResult.success).toBe(true);
    expect(purchaseResult.simulated).toBe(true);
  });

  it("isFeatureEnabled works correctly", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {
        analytics: { id: "f1", key: "analytics", type: "boolean", value: true },
        api_calls: { id: "f2", key: "api_calls", type: "limit", value: 100 },
      },
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isFeatureEnabled("analytics")).toBe(true);
    expect(result.current.isFeatureEnabled("api_calls", 50)).toBe(true);
    expect(result.current.isFeatureEnabled("api_calls", 150)).toBe(false);
    expect(result.current.isFeatureEnabled("nonexistent")).toBe(false);
  });

  it("limitForFeature returns correct limit", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {
        analytics: { id: "f1", key: "analytics", type: "boolean", value: true },
        api_calls: { id: "f2", key: "api_calls", type: "limit", value: 100 },
      },
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.limitForFeature("api_calls")).toBe(100);
    expect(result.current.limitForFeature("analytics")).toBe(-1);
    expect(result.current.limitForFeature("nonexistent")).toBe(-1);
  });

  it("blocks free plan downgrade when Apple subscription is active", async () => {
    const freePlan = { id: "plan-free", name: "Free", amount: 0 };
    const paidPlan = { id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [freePlan, paidPlan],
      subscription: {
        id: "sub-pro",
        apple: { originalTransactionId: "txn-123", environment: "Production" },
      },
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: true },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("plan-free");
    });

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.storeCancelRequired).toBe(true);
    expect(purchaseResult.error).toContain("cancel your current subscription");
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("handles user cancellation (dismissed payment sheet) without error", async () => {
    const paidPlan = { id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [paidPlan],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Start purchase — this will wait for the listener
    let purchaseResult: any;
    const purchasePromise = act(async () => {
      purchaseResult = await result.current.purchase("plan-pro");
    });

    // Wait a tick for the purchase to start, then simulate user cancellation
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      if (capturedOnError) {
        capturedOnError({ code: "E_USER_CANCELLED", message: "User cancelled" });
      }
    });

    await purchasePromise;

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.error).toBeUndefined();
    // Should NOT set the provider-level error state
    expect(result.current.error).toBeNull();
  });

  it("times out purchase when listener never fires", async () => {
    vi.useFakeTimers();

    const paidPlan = { id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [paidPlan],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    const purchasePromise = act(async () => {
      purchaseResult = await result.current.purchase("plan-pro");
    });

    // Advance past the 60s timeout
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    await purchasePromise;

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.error).toContain("timed out");

    vi.useRealTimers();
  });

  it("purchase rejects unknown planId", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [{ id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" }],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("nonexistent-plan");
    });

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.error).toContain("not found");
  });

  it("simulateEvent throws when not in simulation mode", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      subscription: { id: "sub-1" },
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: true },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.simulateEvent("DID_RENEW");
      })
    ).rejects.toThrow("only available in simulation mode");
  });

  it("simulateEvent throws when no active subscription", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createSimulationWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.simulateEvent("EXPIRED");
      })
    ).rejects.toThrow("No active subscription");
  });

  it("simulateEvent succeeds in simulation mode with subscription", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      subscription: { id: "sub-1" },
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          subscription: { id: "sub-1" },
          features: {},
          simulated: true,
          event: "EXPIRED",
        }),
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createSimulationWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let simResult: any;
    await act(async () => {
      simResult = await result.current.simulateEvent("EXPIRED");
    });

    expect(simResult.success).toBe(true);
    expect(simResult.event).toBe("EXPIRED");
  });

  it("cancelSubscription calls client and refetches", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      subscription: { id: "sub-1" },
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.cancelSubscription("too expensive");
    });

    expect(mockCancelSubscription).toHaveBeenCalledWith({
      cancelReason: "too expensive",
    });
    // Refetch is called after cancel
    expect(mockGetCustomer).toHaveBeenCalledTimes(2);
  });

  it("restore works in simulation mode", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createSimulationWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore();
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restored).toBe(true);
    expect(result.current.restoring).toBe(false);
  });

  it("restore works in real mode", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    mockRestoreReal.mockResolvedValue({
      success: true,
      subscription: { id: "sub-1" },
      features: {},
      restored: true,
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore();
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restored).toBe(true);
    expect(result.current.restoring).toBe(false);
  });

  it("restore handles errors gracefully", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    mockRestoreReal.mockRejectedValue(new Error("Store unavailable"));

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore();
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toBe("Store unavailable");
    expect(result.current.restoring).toBe(false);
  });

  it("waitForCustomer shows loadingComponent then children after load", async () => {
    let resolveCustomer!: (v: any) => void;
    const customerPromise = new Promise((r) => { resolveCustomer = r; });
    mockGetCustomer.mockReturnValue(customerPromise);

    const ChildComponent = () => React.createElement("div", { "data-testid": "child" }, "Loaded");

    render(
      React.createElement(
        MantleProvider,
        {
          appId: "test-app",
          customerApiToken: "test-token",
          waitForCustomer: true,
          loadingComponent: React.createElement("div", { "data-testid": "loading" }, "Loading..."),
        },
        React.createElement(ChildComponent)
      )
    );

    // Should show loading component
    expect(screen.getByTestId("loading")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();

    // Resolve the customer fetch
    await act(async () => {
      resolveCustomer({
        id: "cust-1",
        test: false,
        plans: [],
        features: {},
        usage: {},
        usageCredits: [],
        reviews: [],
        billingStatus: "active",
      });
    });

    // Should now show children
    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeTruthy();
    });
  });

  it("real purchase flow: listener verifies and resolves", async () => {
    const paidPlan = { id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [paidPlan],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    mockVerifyAndFinishPurchase.mockResolvedValue({
      success: true,
      subscription: { id: "sub-1" },
      features: {},
      simulated: false,
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    const purchasePromise = act(async () => {
      purchaseResult = await result.current.purchase("plan-pro");
    });

    // Simulate the store calling our purchase listener
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      if (capturedOnPurchase) {
        await capturedOnPurchase({ transactionId: "txn-1", purchaseToken: "jws-token" });
      }
    });

    await purchasePromise;

    expect(purchaseResult.success).toBe(true);
    expect(mockVerifyAndFinishPurchase).toHaveBeenCalled();
  });

  it("handles already-owned error by restoring", async () => {
    const paidPlan = { id: "plan-pro", name: "Pro", amount: 999, appleProductId: "com.app.pro" };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [paidPlan],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    mockRestoreReal.mockResolvedValue({
      success: true,
      subscription: { id: "sub-1" },
      features: {},
      restored: true,
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    const purchasePromise = act(async () => {
      purchaseResult = await result.current.purchase("plan-pro");
    });

    // Simulate already-owned error from store
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      if (capturedOnError) {
        capturedOnError({ code: "already-owned", message: "Already owned" });
      }
    });

    await purchasePromise;

    expect(purchaseResult.success).toBe(true);
    expect(mockRestoreReal).toHaveBeenCalled();
  });

  it("allows free plan subscription when no Apple subscription exists", async () => {
    const freePlan = { id: "plan-free", name: "Free", amount: 0 };

    mockGetCustomer
      .mockResolvedValueOnce({
        id: "cust-1",
        test: false,
        plans: [freePlan],
        features: {},
        usage: {},
        usageCredits: [],
        reviews: [],
        billingStatus: "none",
        apple: { configured: true },
      })
      .mockResolvedValue({
        id: "cust-1",
        test: false,
        plans: [freePlan],
        subscription: { id: "sub-free" },
        features: {},
        usage: {},
        usageCredits: [],
        reviews: [],
        billingStatus: "active",
        apple: { configured: true },
      });

    mockSubscribe.mockResolvedValue({ id: "sub-free", plan: freePlan });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("plan-free");
    });

    expect(purchaseResult.success).toBe(true);
    expect(purchaseResult.storeCancelRequired).toBeUndefined();
    expect(mockSubscribe).toHaveBeenCalledWith({ planId: "plan-free", billingProvider: "apple" });
  });

  it("cancelSubscription without reason omits cancelReason", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      subscription: { id: "sub-1" },
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
      apple: { configured: false },
    });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.cancelSubscription();
    });

    expect(mockCancelSubscription).toHaveBeenCalledWith({});
  });

  it("free plan subscribe returns error when API fails", async () => {
    const freePlan = { id: "plan-free", name: "Free", amount: 0 };

    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [freePlan],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "none",
      apple: { configured: true },
    });

    mockSubscribe.mockResolvedValue({ error: "Subscription failed" });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let purchaseResult: any;
    await act(async () => {
      purchaseResult = await result.current.purchase("plan-free");
    });

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.error).toBe("Subscription failed");
  });
});

describe("sendUsageEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a usage event successfully", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
    });

    mockSendUsageEvent.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvent({
        eventName: "api_call",
        properties: { endpoint: "/users" },
      });
    });

    expect(eventResult.success).toBe(true);
    expect(mockSendUsageEvent).toHaveBeenCalledWith({
      eventName: "api_call",
      properties: { endpoint: "/users" },
    });
  });

  it("returns error when sendUsageEvent fails", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
    });

    mockSendUsageEvent.mockResolvedValue({ error: "Rate limit exceeded" });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvent({
        eventName: "api_call",
      });
    });

    expect(eventResult.success).toBe(false);
    expect(eventResult.error).toBe("Rate limit exceeded");
  });

  it("handles exception in sendUsageEvent", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
    });

    mockSendUsageEvent.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvent({
        eventName: "api_call",
      });
    });

    expect(eventResult.success).toBe(false);
    expect(eventResult.error).toBe("Network error");
  });
});

describe("sendUsageEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends multiple usage events with customerId", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
    });

    mockSendUsageEvents.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvents([
        { eventName: "api_call", properties: { endpoint: "/users" } },
        { eventName: "api_call", properties: { endpoint: "/posts" } },
      ]);
    });

    expect(eventResult.success).toBe(true);
    expect(mockSendUsageEvents).toHaveBeenCalledWith({
      events: [
        { eventName: "api_call", properties: { endpoint: "/users" }, customerId: "cust-1" },
        { eventName: "api_call", properties: { endpoint: "/posts" }, customerId: "cust-1" },
      ],
    });
  });

  it("returns error when no customer loaded", async () => {
    mockGetCustomer.mockResolvedValue({ error: "Unauthorized" });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvents([
        { eventName: "api_call" },
      ]);
    });

    expect(eventResult.success).toBe(false);
    expect(eventResult.error).toBe("No customer loaded");
    expect(mockSendUsageEvents).not.toHaveBeenCalled();
  });

  it("returns error when sendUsageEvents fails", async () => {
    mockGetCustomer.mockResolvedValue({
      id: "cust-1",
      test: false,
      plans: [],
      features: {},
      usage: {},
      usageCredits: [],
      reviews: [],
      billingStatus: "active",
    });

    mockSendUsageEvents.mockResolvedValue({ error: "Batch too large" });

    const { result } = renderHook(() => useMantle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let eventResult: any;
    await act(async () => {
      eventResult = await result.current.sendUsageEvents([
        { eventName: "api_call" },
      ]);
    });

    expect(eventResult.success).toBe(false);
    expect(eventResult.error).toBe("Batch too large");
  });
});

describe("useMantleContext", () => {
  it("throws when used outside MantleProvider", () => {
    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useMantleContext());
    }).toThrow("must be used within a MantleProvider");

    consoleSpy.mockRestore();
  });
});
