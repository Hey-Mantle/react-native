/**
 * @module types
 * @description Types for @heymantle/react-native SDK
 */

import type React from "react";
import type {
  Customer,
  Feature,
  MantleClient,
  MantleError,
  Plan,
  Subscription,
  UsageEvent,
} from "@heymantle/client";

// Re-export types consumers need
export type {
  Customer,
  Feature,
  MantleClient,
  MantleError,
  Plan,
  Subscription,
  UsageEvent,
} from "@heymantle/client";

/**
 * Extended Customer type that includes billing configuration
 * returned by Mantle's customer endpoint for apps with store billing (Apple, Google, etc).
 */
export interface CustomerWithBilling extends Customer {
  apple?: BillingConfig;
}

/** Supported simulation lifecycle events */
export type SimulateEvent =
  | "DID_RENEW"
  | "DID_CHANGE_RENEWAL_STATUS"
  | "EXPIRED"
  | "DID_FAIL_TO_RENEW"
  | "GRACE_PERIOD_EXPIRED"
  | "REFUND";

/** Store environment types */
export type StoreEnvironment = "Production" | "Sandbox" | "Simulated";

/** Billing configuration from customer response */
export interface BillingConfig {
  /** Whether real store credentials are configured in Mantle */
  configured: boolean;
}

/** Billing state exposed through context */
export interface BillingState {
  /** Whether the SDK is using simulation mode (must be explicitly enabled) */
  simulationMode: boolean;
  /** Current store environment, or null if no subscription */
  environment: StoreEnvironment | null;
}

/** Result of a purchase operation */
export interface PurchaseResult {
  success: boolean;
  subscription: Subscription | null;
  features: Record<string, Feature>;
  simulated: boolean;
  error?: string;
  /**
   * When true, the user has an active store subscription (Apple/Google) that
   * cannot be cancelled programmatically. The app should prompt the user to
   * cancel their subscription via platform settings (e.g. iOS Settings →
   * Subscriptions or Google Play → Subscriptions).
   */
  storeCancelRequired?: boolean;
}

/** Result of a restore operation */
export interface RestoreResult {
  success: boolean;
  subscription: Subscription | null;
  features: Record<string, Feature>;
  restored: boolean;
  error?: string;
}

/** Result of a simulate event operation */
export interface SimulateResult {
  success: boolean;
  subscription: Subscription | null;
  features: Record<string, Feature>;
  event: SimulateEvent;
  error?: string;
}

/** Params for sending a usage event */
export interface SendUsageEventParams {
  /** Unique event ID (auto-generated if not provided) */
  eventId?: string;
  /** Event name matching a usage metric */
  eventName: string;
  /** Event timestamp (defaults to now) */
  timestamp?: Date;
  /** Additional event properties */
  properties?: Record<string, any>;
}

/** Result of a usage event operation */
export interface UsageEventResult {
  success: boolean;
  error?: string;
}

/** API configuration for making Mantle requests */
export interface ApiConfig {
  apiUrl: string;
  appId: string;
  customerApiToken: string;
}

/** Props for the MantleProvider component */
export interface MantleProviderProps {
  /** The Mantle App ID provided by Mantle */
  appId: string;
  /** The Mantle Customer API Token returned by the identify endpoint */
  customerApiToken: string;
  /** The Mantle API URL to use */
  apiUrl?: string;
  /** The children to render */
  children: React.ReactNode;
  /** If true, renders nothing (or loadingComponent) until customer is fetched */
  waitForCustomer?: boolean;
  /** Component to render while waiting for the customer to be fetched */
  loadingComponent?: React.ReactNode;
  /**
   * Enable simulation mode for testing without store credentials.
   * Must be explicitly set to true — defaults to false.
   * In production, this should never be enabled.
   */
  simulationMode?: boolean;
}

/** The context interface exposed by MantleProvider */
export interface MantleReactNativeContext {
  /** The MantleClient instance */
  client: MantleClient;
  /** The current customer */
  customer: Customer | null;
  /** The current subscription */
  subscription: Subscription | null;
  /** The available plans */
  plans: Plan[];
  /** Customer features */
  features: Record<string, Feature>;
  /** Whether the customer is loading */
  loading: boolean;

  /** Billing state */
  billing: BillingState;

  /** Purchase a plan by ID */
  purchase: (planId: string) => Promise<PurchaseResult>;
  /** Restore purchases */
  restore: () => Promise<RestoreResult>;
  /** Cancel the current subscription */
  cancelSubscription: (reason?: string) => Promise<Subscription | MantleError>;
  /** Simulate a lifecycle event (simulation mode only) */
  simulateEvent: (event: SimulateEvent) => Promise<SimulateResult>;
  /** Send a usage event */
  sendUsageEvent: (params: SendUsageEventParams) => Promise<UsageEventResult>;
  /** Send multiple usage events */
  sendUsageEvents: (events: SendUsageEventParams[]) => Promise<UsageEventResult>;
  /** Open the platform's subscription management page */
  openSubscriptionManagement: () => Promise<void>;
  /** Refetch customer data */
  refetch: () => Promise<void>;

  /** Check if a feature is enabled */
  isFeatureEnabled: (featureKey: string, count?: number) => boolean;
  /** Get the limit for a feature */
  limitForFeature: (featureKey: string) => number;

  /** Whether a purchase is in flight */
  purchasing: boolean;
  /** Whether a restore is in flight */
  restoring: boolean;
  /** Last error */
  error: Error | null;
}
