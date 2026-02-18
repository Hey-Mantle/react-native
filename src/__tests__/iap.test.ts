import { describe, it, expect, vi, beforeEach } from "vitest";
import * as mockRNIap from "../__mocks__/react-native-iap";
import {
  initIAPConnection,
  fetchIAPProducts,
  requestIAPSubscription,
  finishIAPTransaction,
  getRestoredPurchases,
  verifyAndFinishPurchase,
  restoreReal,
} from "../services/iap";
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

describe("IAP Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initIAPConnection", () => {
    it("initializes connection and returns cleanup", async () => {
      const cleanup = await initIAPConnection();
      expect(mockRNIap.initConnection).toHaveBeenCalled();
      expect(typeof cleanup).toBe("function");

      cleanup();
      expect(mockRNIap.endConnection).toHaveBeenCalled();
    });
  });

  describe("fetchIAPProducts", () => {
    it("fetches subscription products by SKU", async () => {
      const mockProducts = [{ productId: "com.app.premium", price: "9.99" }];
      mockRNIap.fetchProducts.mockResolvedValue(mockProducts);

      const products = await fetchIAPProducts(["com.app.premium"]);

      expect(mockRNIap.fetchProducts).toHaveBeenCalledWith({
        skus: ["com.app.premium"],
        type: "subs",
      });
      expect(products).toEqual(mockProducts);
    });

    it("returns empty array for empty SKU list", async () => {
      const products = await fetchIAPProducts([]);
      expect(products).toEqual([]);
      expect(mockRNIap.fetchProducts).not.toHaveBeenCalled();
    });
  });

  describe("requestIAPSubscription", () => {
    it("calls requestPurchase with correct sku", async () => {
      await requestIAPSubscription("com.app.premium");
      expect(mockRNIap.requestPurchase).toHaveBeenCalledWith({
        request: { apple: { sku: "com.app.premium" } },
        type: "subs",
      });
    });
  });

  describe("finishIAPTransaction", () => {
    it("finishes the transaction as non-consumable", async () => {
      const purchase = { transactionId: "txn-1" };
      await finishIAPTransaction(purchase);
      expect(mockRNIap.finishTransaction).toHaveBeenCalledWith({
        purchase,
        isConsumable: false,
      });
    });
  });

  describe("getRestoredPurchases", () => {
    it("returns sorted purchases with productId", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([
        { productId: "a", transactionDate: 100 },
        { productId: "b", transactionDate: 300 },
        { productId: null, transactionDate: 400 },
        { productId: "c", transactionDate: 200 },
      ]);

      const purchases = await getRestoredPurchases();
      expect(purchases).toHaveLength(3);
      expect(purchases[0].productId).toBe("b");
      expect(purchases[1].productId).toBe("c");
      expect(purchases[2].productId).toBe("a");
    });
  });

  describe("verifyAndFinishPurchase", () => {
    it("prefers JWS (purchaseToken) over transactionId", async () => {
      mockFetchOk({
        subscription: { id: "sub-1" },
        features: {},
      });

      const purchase = {
        transactionId: "txn-123",
        purchaseToken: "eyJhbGciOi...",
      };
      await verifyAndFinishPurchase(apiConfig, purchase);

      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        jwsTransaction: "eyJhbGciOi...",
      });
    });

    it("falls back to transactionId when no purchaseToken", async () => {
      mockFetchOk({
        subscription: { id: "sub-1" },
        features: {},
      });

      const purchase = { transactionId: "txn-123" };
      await verifyAndFinishPurchase(apiConfig, purchase);

      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        transactionId: "txn-123",
      });
    });

    it("verifies and finishes a purchase successfully", async () => {
      mockFetchOk({
        subscription: { id: "sub-1" },
        features: { analytics: { type: "boolean", value: true } },
      });

      const purchase = { transactionId: "txn-123" };
      const result = await verifyAndFinishPurchase(apiConfig, purchase);

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(false);
      expect(result.subscription).toEqual({ id: "sub-1" });
      expect(mockRNIap.finishTransaction).toHaveBeenCalledWith({
        purchase,
        isConsumable: false,
      });
    });

    it("returns error when verify fails and does NOT finish transaction", async () => {
      mockFetchError(400, { error: "Invalid receipt" });

      const result = await verifyAndFinishPurchase(apiConfig, {
        transactionId: "bad",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid receipt");
      expect(mockRNIap.finishTransaction).not.toHaveBeenCalled();
    });

    it("falls back to transactionReceipt when no purchaseToken or transactionId", async () => {
      mockFetchOk({ subscription: { id: "sub-1" }, features: {} });

      const purchase = { transactionReceipt: "receipt-data-123" };
      await verifyAndFinishPurchase(apiConfig, purchase);

      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        transactionId: "receipt-data-123",
      });
    });

    it("handles network errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await verifyAndFinishPurchase(apiConfig, {
        transactionId: "txn-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(result.simulated).toBe(false);
      expect(mockRNIap.finishTransaction).not.toHaveBeenCalled();
    });
  });

  describe("restoreReal", () => {
    it("prefers JWS (purchaseToken) for restore", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([
        {
          productId: "a",
          transactionId: "txn-1",
          purchaseToken: "eyJ...",
          transactionDate: 100,
        },
      ]);

      mockFetchOk({ subscription: { id: "sub-1" }, features: {}, restored: true });

      await restoreReal(apiConfig);

      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ jwsTransaction: "eyJ..." });
    });

    it("falls back to originalTransactionId when no purchaseToken", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([
        { productId: "a", transactionId: "txn-1", transactionDate: 100 },
      ]);

      mockFetchOk({ subscription: { id: "sub-1" }, features: {}, restored: true });

      const result = await restoreReal(apiConfig);

      expect(result.success).toBe(true);
      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        originalTransactionId: "txn-1",
      });
    });

    it("restores the most recent purchase", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([
        { productId: "a", transactionId: "txn-1", transactionDate: 100 },
        { productId: "b", transactionId: "txn-2", transactionDate: 200 },
      ]);

      mockFetchOk({ subscription: { id: "sub-1" }, features: {}, restored: true });

      const result = await restoreReal(apiConfig);

      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);

      const [, options] = (fetch as any).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        originalTransactionId: "txn-2",
      });
    });

    it("returns error when no purchases found", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([]);

      const result = await restoreReal(apiConfig);

      expect(result.success).toBe(false);
      expect(result.restored).toBe(false);
      expect(result.error).toBe("No purchases found");
    });

    it("returns error when API returns error", async () => {
      mockRNIap.getAvailablePurchases.mockResolvedValue([
        { productId: "a", transactionId: "txn-1", transactionDate: 100 },
      ]);

      mockFetchError(400, { error: "Invalid transaction" });

      const result = await restoreReal(apiConfig);

      expect(result.success).toBe(false);
      expect(result.restored).toBe(false);
      expect(result.error).toBe("Invalid transaction");
    });

    it("handles network errors gracefully", async () => {
      mockRNIap.getAvailablePurchases.mockRejectedValue(
        new Error("Store unavailable")
      );

      const result = await restoreReal(apiConfig);

      expect(result.success).toBe(false);
      expect(result.restored).toBe(false);
      expect(result.error).toBe("Store unavailable");
    });
  });
});
