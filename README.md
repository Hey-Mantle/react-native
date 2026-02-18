# @heymantle/react-native

React Native SDK for [Mantle](https://heymantle.com) billing with Apple In-App Purchase support.

## Features

- 🍎 **Apple IAP** — Wraps `react-native-iap` for real App Store purchases
- 🧪 **Simulation mode** — Full purchase flow testing without Apple credentials or a device
- 🔐 **Feature gating** — `useFeature()` hook for boolean and limit-based feature checks
- ♻️ **Restore purchases** — Standard iOS restore flow synced with Mantle backend
- 🔄 **Lifecycle simulation** — Test renewals, expirations, refunds, and more

## Installation

```bash
npm install @heymantle/react-native @heymantle/client
cd ios && pod install
```

This installs `react-native-iap` automatically as a dependency.

## Authentication

The SDK requires a `customerApiToken` — a customer-scoped token that is safe to use on the client. Your backend is responsible for obtaining this token by calling Mantle's [identify](https://docs.heymantle.com) endpoint with your secret API key:

```
# Your backend calls identify with your secret API key
POST https://appapi.heymantle.com/v1/identify
X-Mantle-App-Api-Key: your-secret-api-key

{ "platform": "...", "platformId": "...", "name": "...", "email": "..." }

# Response includes the customer API token
{ "apiToken": "cust_abc123..." }
```

Your backend then passes `apiToken` to the React Native app (e.g. as part of your auth/login response). The app never needs your secret API key.

## Quick Start

### 1. Wrap your app with MantleProvider

```tsx
import { MantleProvider } from '@heymantle/react-native';

function App() {
  // customerApiToken comes from your backend's identify call
  const { customerApiToken } = useAuth();

  return (
    <MantleProvider
      appId="your-mantle-app-id"
      customerApiToken={customerApiToken}
    >
      <YourApp />
    </MantleProvider>
  );
}
```

### 2. Use the hooks

```tsx
import { useMantle, useFeature } from '@heymantle/react-native';

function HomeScreen() {
  const { plans, subscription, purchase } = useMantle();
  const { enabled: hasAdvanced } = useFeature('advanced_analytics');

  return (
    <View>
      {!subscription && plans.map(plan => (
        <Button
          key={plan.id}
          title={`Subscribe to ${plan.name}`}
          onPress={() => purchase(plan.id)}
        />
      ))}

      {subscription && <Text>Subscribed to {subscription.plan?.name}</Text>}

      {hasAdvanced && <AdvancedAnalytics />}
    </View>
  );
}
```

## Simulation Mode

Simulation mode must be **explicitly enabled** via the `simulationMode` prop. It is never enabled automatically — if Apple credentials aren't configured on your Mantle app, purchases will fail rather than silently falling back to simulation.

```tsx
<MantleProvider
  appId="your-mantle-app-id"
  customerApiToken={token}
  simulationMode={__DEV__} // Only enable in development
>
  <YourApp />
</MantleProvider>
```

### Simulating Lifecycle Events

In simulation mode, you can test subscription lifecycle events:

```tsx
import { useMantle } from '@heymantle/react-native';

function DevTools() {
  const { subscription, simulateEvent, billing } = useMantle();

  if (!billing.simulationMode || !subscription) return null;

  return (
    <View>
      <Text>Simulation Dev Tools</Text>
      <Button title="Simulate Renewal" onPress={() => simulateEvent('DID_RENEW')} />
      <Button title="Simulate Expiry" onPress={() => simulateEvent('EXPIRED')} />
      <Button title="Simulate Payment Failure" onPress={() => simulateEvent('DID_FAIL_TO_RENEW')} />
      <Button title="Simulate Refund" onPress={() => simulateEvent('REFUND')} />
      <Button title="Simulate Grace Period Expired" onPress={() => simulateEvent('GRACE_PERIOD_EXPIRED')} />
    </View>
  );
}
```

Supported events: `DID_RENEW`, `DID_CHANGE_RENEWAL_STATUS`, `EXPIRED`, `DID_FAIL_TO_RENEW`, `GRACE_PERIOD_EXPIRED`, `REFUND`

## Purchase Flow

The `purchase()` function works identically in both modes:

```tsx
import { usePurchase } from '@heymantle/react-native';

function SubscriptionScreen() {
  const { purchase, restore, purchasing, restoring, error, clearError } = usePurchase();

  return (
    <View>
      <Button
        title={purchasing ? 'Processing...' : 'Subscribe — $9.99/mo'}
        disabled={purchasing}
        onPress={() => purchase('plan-id')}
      />

      <Button
        title={restoring ? 'Restoring...' : 'Restore Purchases'}
        disabled={restoring}
        onPress={restore}
      />

      {error && (
        <View>
          <Text>Error: {error.message}</Text>
          <Button title="Dismiss" onPress={clearError} />
        </View>
      )}
    </View>
  );
}
```

## Feature Gating

```tsx
import { useFeature } from '@heymantle/react-native';

function FeatureGatedScreen() {
  // Boolean feature
  const { enabled: canExport } = useFeature('can_export');

  // Limit feature
  const { enabled, limit } = useFeature('monthly_exports', { count: currentExports });

  if (!enabled) {
    return (
      <View>
        <Text>You've reached your export limit ({limit} per month)</Text>
        <UpgradeButton />
      </View>
    );
  }

  return <ExportTool />;
}
```

## API Reference

### `<MantleProvider>`

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `appId` | `string` | ✅ | — | Your Mantle App ID |
| `customerApiToken` | `string` | ✅ | — | Customer API token obtained from your backend (see [Authentication](#authentication)) |
| `apiUrl` | `string` | — | `https://appapi.heymantle.com/v1` | Mantle API URL |
| `simulationMode` | `boolean` | — | `false` | Enable simulation mode for testing without store credentials |
| `waitForCustomer` | `boolean` | — | `false` | Block rendering until customer is loaded |
| `loadingComponent` | `ReactNode` | — | `null` | Component to show while loading (when `waitForCustomer` is true) |

### `useMantle()`

Returns the full Mantle context:

| Property | Type | Description |
|----------|------|-------------|
| `client` | `MantleClient` | The underlying MantleClient instance |
| `customer` | `Customer \| null` | Current customer data |
| `subscription` | `Subscription \| null` | Current subscription |
| `plans` | `Plan[]` | Available plans |
| `features` | `Record<string, Feature>` | Customer features |
| `loading` | `boolean` | Whether customer data is loading |
| `billing` | `BillingState` | Billing state (`simulationMode`, `environment`) |
| `purchase(planId)` | `(string) => Promise<PurchaseResult>` | Purchase a plan |
| `restore()` | `() => Promise<RestoreResult>` | Restore purchases |
| `cancelSubscription(reason?)` | `(string?) => Promise` | Cancel subscription |
| `simulateEvent(event)` | `(SimulateEvent) => Promise<SimulateResult>` | Simulate lifecycle event (simulation mode only) |
| `openSubscriptionManagement()` | `() => Promise<void>` | Open platform subscription settings |
| `refetch()` | `() => Promise<void>` | Refetch customer data |
| `isFeatureEnabled(key, count?)` | `(string, number?) => boolean` | Check if feature is enabled |
| `limitForFeature(key)` | `(string) => number` | Get feature limit (-1 if none) |
| `purchasing` | `boolean` | Whether a purchase is in flight |
| `restoring` | `boolean` | Whether a restore is in flight |
| `error` | `Error \| null` | Last error |

### `useFeature(featureKey, options?)`

| Return | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Whether the feature is enabled |
| `limit` | `number` | The limit value (-1 if not a limit feature) |
| `value` | `any` | Raw feature value |

### `usePurchase()`

| Return | Type | Description |
|--------|------|-------------|
| `purchase(planId)` | `(string) => Promise<PurchaseResult>` | Purchase a plan |
| `restore()` | `() => Promise<RestoreResult>` | Restore purchases |
| `purchasing` | `boolean` | Whether a purchase is in flight |
| `restoring` | `boolean` | Whether a restore is in flight |
| `error` | `Error \| null` | Last error |
| `clearError()` | `() => void` | Clear the last error |
| `simulationMode` | `boolean` | Whether in simulation mode |

## Important Notes

1. **Apple subscriptions cannot be cancelled programmatically.** `cancelSubscription()` sets `cancelAtPeriodEnd: true` in Mantle but does NOT cancel with Apple. Users must cancel via iOS Settings → Subscriptions. When downgrading to a free plan while an Apple subscription is active, `purchase()` returns `{ success: false, storeCancelRequired: true }` — the user must cancel in iOS Settings first:

   ```tsx
   const result = await purchase(freePlanId);
   if (result.storeCancelRequired) {
     Alert.alert(
       'Cancel First',
       'To switch to the free plan, cancel your subscription in iOS Settings → Subscriptions. Your current plan will remain active until the end of your billing period.',
       [{ text: 'Open Settings', onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions') },
        { text: 'OK' }]
     );
   }
   ```

2. **`react-native-iap` is dynamically imported** — it's loaded at runtime only when needed (real mode), not at module level.

3. **Simulation mode must be explicitly enabled** via the `simulationMode` prop. It defaults to `false` and is never auto-enabled.

4. **Transactions are always finished** — in real mode, the SDK calls `finishTransaction()` after Mantle verification to prevent Apple from re-delivering the transaction.

## License

ISC
