---
name: mantle-react-native
description: Integrate Mantle billing into a React Native app using @heymantle/react-native. Covers installation, MantleProvider setup, subscription purchase flows, feature gating, restore purchases, and simulation mode for testing. Use when adding in-app purchases or subscription billing with Mantle to a React Native project.
---

# Mantle React Native Integration

Guide for integrating `@heymantle/react-native` into a React Native app for Apple In-App Purchase billing via [Mantle](https://heymantle.com).

## Prerequisites

- A React Native app (>= 0.70)
- A Mantle account with an app configured
- A `customerApiToken` obtained from Mantle's identify endpoint (typically via your backend)

## Step 1: Install

```bash
npm install @heymantle/react-native @heymantle/client
cd ios && pod install
```

This installs `react-native-iap` automatically as a dependency. The `pod install` step links the native IAP module.

## Step 2: Add MantleProvider

Wrap your app (or the billing-relevant subtree) with `MantleProvider`. It must receive `appId` and `customerApiToken`.

```tsx
import { MantleProvider } from '@heymantle/react-native';

function App() {
  // customerApiToken comes from your auth flow — your backend calls
  // Mantle's identify endpoint and passes the token to the client.
  const customerApiToken = useCustomerToken();

  return (
    <MantleProvider
      appId="your-mantle-app-id"
      customerApiToken={customerApiToken}
      apiUrl={__DEV__ ? 'http://localhost:3000/v1' : undefined} // optional: override for local dev
      waitForCustomer={true}
      loadingComponent={<LoadingScreen />}
    >
      <MainNavigator />
    </MantleProvider>
  );
}
```

### MantleProvider Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `appId` | `string` | ✅ | — | Mantle App ID |
| `customerApiToken` | `string` | ✅ | — | From Mantle's identify endpoint |
| `apiUrl` | `string` | — | `https://appapi.heymantle.com/v1` | API base URL |
| `waitForCustomer` | `boolean` | — | `false` | Delay rendering until customer loads |
| `loadingComponent` | `ReactNode` | — | `null` | Shown while loading if `waitForCustomer` is true |

## Step 3: Display Plans & Purchase

Use `useMantle()` to access plans, subscription state, and the `purchase()` function.

```tsx
import { useMantle } from '@heymantle/react-native';

function PaywallScreen() {
  const { plans, subscription, purchase, purchasing } = useMantle();

  if (subscription) {
    return <Text>You're subscribed to {subscription.plan?.name}</Text>;
  }

  return (
    <View>
      {plans.map(plan => (
        <Button
          key={plan.id}
          title={purchasing ? 'Processing...' : `${plan.name} — $${plan.amount}/mo`}
          disabled={purchasing}
          onPress={() => purchase(plan.id)}
        />
      ))}
    </View>
  );
}
```

### Using usePurchase for more control

`usePurchase()` provides local `purchasing`, `restoring`, and `error` state:

```tsx
import { usePurchase } from '@heymantle/react-native';

function SubscribeButton({ planId }: { planId: string }) {
  const { purchase, purchasing, error, clearError } = usePurchase();

  return (
    <View>
      <Button
        title={purchasing ? 'Processing...' : 'Subscribe'}
        disabled={purchasing}
        onPress={() => purchase(planId)}
      />
      {error && (
        <>
          <Text style={{ color: 'red' }}>{error.message}</Text>
          <Button title="Dismiss" onPress={clearError} />
        </>
      )}
    </View>
  );
}
```

## Step 4: Feature Gating

Gate UI or functionality based on the customer's plan features.

```tsx
import { useFeature } from '@heymantle/react-native';

function PremiumFeature() {
  // Boolean feature
  const { enabled } = useFeature('advanced_analytics');

  if (!enabled) return <UpgradePrompt feature="Advanced Analytics" />;
  return <AnalyticsDashboard />;
}

function UsageLimitedFeature() {
  // Limit feature — pass current usage as count
  const { enabled, limit } = useFeature('monthly_exports', { count: currentExports });

  if (!enabled) {
    return <Text>Export limit reached ({limit}/month). Upgrade for more.</Text>;
  }
  return <ExportButton />;
}
```

### Feature types

| Type | `enabled` logic | `limit` value |
|------|----------------|---------------|
| `boolean` | `true` if value is truthy | `-1` |
| `limit` | `true` if count < value (or value is -1 = unlimited) | The limit number |
| `limit_with_overage` | Always `true` (overage is billed) | The base limit |

## Step 5: Restore Purchases

iOS App Store guidelines require a "Restore Purchases" button.

```tsx
function RestoreButton() {
  const { restore, restoring } = usePurchase();

  return (
    <Button
      title={restoring ? 'Restoring...' : 'Restore Purchases'}
      disabled={restoring}
      onPress={restore}
    />
  );
}
```

## Step 6: Cancel Subscription & Free Plan Downgrades

Apple subscriptions cannot be cancelled programmatically. `cancelSubscription()` records the intent in Mantle but the user must cancel in iOS Settings.

```tsx
function CancelButton() {
  const { cancelSubscription, subscription } = useMantle();

  if (!subscription) return null;

  return (
    <Button
      title="Cancel Subscription"
      onPress={async () => {
        await cancelSubscription('User requested cancellation');
        Alert.alert(
          'Cancel in iOS Settings',
          'To stop future charges, go to iOS Settings → Subscriptions and cancel.'
        );
      }}
    />
  );
}
```

### Free Plan Downgrades

When a user tries to switch to a free plan while an active Apple subscription exists, `purchase()` returns `{ success: false, storeCancelRequired: true }`. The user must cancel in iOS Settings first.

```tsx
import { Linking } from 'react-native';

function DowngradeButton({ freePlanId }: { freePlanId: string }) {
  const { purchase } = useMantle();

  return (
    <Button
      title="Switch to Free"
      onPress={async () => {
        const result = await purchase(freePlanId);
        if (result.storeCancelRequired) {
          Alert.alert(
            'Cancel First',
            'To switch to the free plan, cancel your subscription in iOS Settings → Subscriptions. ' +
            'Your current plan stays active until the end of your billing period.',
            [
              { text: 'Open Settings', onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions') },
              { text: 'OK' },
            ]
          );
        }
      }}
    />
  );
}
```

## Simulation Mode (Development & Testing)

Simulation mode lets you build and test the full purchase flow without Apple credentials or a device. It must be **explicitly enabled** via the `simulationMode` prop.

```tsx
<MantleProvider
  appId="your-mantle-app-id"
  customerApiToken={customerApiToken}
  simulationMode={__DEV__} // Only in development
>
  <YourApp />
</MantleProvider>
```

### Simulating lifecycle events

Test how your app handles renewals, expirations, refunds, and failures:

```tsx
function SimulationDevTools() {
  const { subscription, simulateEvent, billing } = useMantle();

  if (!billing.simulationMode || !subscription) return null;

  return (
    <View>
      <Text>🧪 Simulation Dev Tools</Text>
      <Button title="Renew" onPress={() => simulateEvent('DID_RENEW')} />
      <Button title="Expire" onPress={() => simulateEvent('EXPIRED')} />
      <Button title="Payment Failed" onPress={() => simulateEvent('DID_FAIL_TO_RENEW')} />
      <Button title="Refund" onPress={() => simulateEvent('REFUND')} />
      <Button title="Grace Period Expired" onPress={() => simulateEvent('GRACE_PERIOD_EXPIRED')} />
    </View>
  );
}
```

### Supported simulation events

| Event | What it simulates |
|-------|-------------------|
| `DID_RENEW` | Successful subscription renewal |
| `DID_CHANGE_RENEWAL_STATUS` | Auto-renew toggled off |
| `EXPIRED` | Subscription expired |
| `DID_FAIL_TO_RENEW` | Payment failed on renewal |
| `GRACE_PERIOD_EXPIRED` | Grace period ended after failed payment |
| `REFUND` | Apple issued a refund |

## Full Hook Reference

### useMantle()

| Property | Type | Description |
|----------|------|-------------|
| `client` | `MantleClient` | Underlying client instance |
| `customer` | `Customer \| null` | Customer data |
| `subscription` | `Subscription \| null` | Current subscription |
| `plans` | `Plan[]` | Available plans |
| `features` | `Record<string, Feature>` | Customer features map |
| `loading` | `boolean` | Loading state |
| `billing` | `BillingState` | Billing state (`simulationMode`, `environment`) |
| `purchase(planId)` | `Promise<PurchaseResult>` | Purchase a plan |
| `restore()` | `Promise<RestoreResult>` | Restore purchases |
| `cancelSubscription(reason?)` | `Promise` | Cancel subscription |
| `simulateEvent(event)` | `Promise<SimulateResult>` | Simulate lifecycle event |
| `openSubscriptionManagement()` | `Promise<void>` | Open platform subscription settings |
| `refetch()` | `Promise<void>` | Refetch customer data |
| `isFeatureEnabled(key, count?)` | `boolean` | Check feature |
| `limitForFeature(key)` | `number` | Get limit (-1 if none) |
| `purchasing` | `boolean` | Purchase in flight |
| `restoring` | `boolean` | Restore in flight |
| `error` | `Error \| null` | Last error |

### useFeature(key, options?)

Returns `{ enabled: boolean, limit: number, value: any }`

### usePurchase()

Returns `{ purchase, restore, purchasing, restoring, error, clearError, simulationMode }`

## Important Notes

1. **Apple subscriptions cannot be cancelled server-side.** `cancelSubscription()` sets `cancelAtPeriodEnd` in Mantle but does not cancel with Apple. Users must cancel via iOS Settings → Subscriptions.

2. **`react-native-iap` is dynamically imported** — it's loaded at runtime only when needed (real mode), not at module level.

3. **Always include a Restore Purchases button** — required by Apple App Store guidelines.

4. **Transactions are always finished** — in real mode, `finishTransaction()` is called after Mantle verification to prevent Apple from re-delivering the transaction.
