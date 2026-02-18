/**
 * Mock for react-native-iap used in tests.
 * The real module requires native code and can't be resolved in a Node/jsdom environment.
 */

import { vi } from "vitest";

export const initConnection = vi.fn().mockResolvedValue(true);
export const endConnection = vi.fn().mockResolvedValue(undefined);
export const fetchProducts = vi.fn().mockResolvedValue([]);
export const requestPurchase = vi.fn().mockResolvedValue(undefined);
export const finishTransaction = vi.fn().mockResolvedValue(undefined);
export const getAvailablePurchases = vi.fn().mockResolvedValue([]);
export const purchaseUpdatedListener = vi
  .fn()
  .mockReturnValue({ remove: vi.fn() });
export const purchaseErrorListener = vi
  .fn()
  .mockReturnValue({ remove: vi.fn() });
