# CLAUDE.md — @heymantle/react-native

## What This Is
React Native SDK for Mantle billing. Wraps `react-native-iap` for Apple IAP and provides a simulation mode for testing without Apple credentials.

## Tech Stack
- TypeScript (strict mode)
- React Native (peer dep >= 0.70)
- react-native-iap (dependency >= 12.0.0)
- @heymantle/client (dependency)
- tsup for building (CJS + ESM + DTS)
- vitest for testing

## Key Commands
- `npm run build` — Build with tsup
- `npm test` — Run vitest
- `npm run test:watch` — Watch mode

## Key Patterns
- All Apple API calls go through `src/services/api.ts` using fetch with Mantle auth headers
- Simulation mode = explicit `simulationMode` prop on MantleProvider (default: false, never auto-enabled)
- Types in `src/types.ts`, re-export @heymantle/client types as needed
- `react-native-iap` is dynamically imported at runtime, not at module level

## Auth Headers
All requests use:
- `X-Mantle-App-Id: <appId>`
- `X-Mantle-Customer-Api-Token: <customerApiToken>`

## Mantle Apple API Endpoints
- `GET /v1/customer` — Returns customer with `apple: { configured: boolean }` field
- `POST /v1/subscriptions/apple/verify` — Verify purchase (real or simulated)
- `POST /v1/subscriptions/apple/restore` — Restore subscription
- `POST /v1/subscriptions/apple/simulate` — Simulate lifecycle events
- `DELETE /v1/subscriptions` — Cancel subscription

## Project Structure
- `src/MantleProvider.tsx` — Main provider component with billing context
- `src/services/api.ts` — Thin fetch wrapper for Mantle API
- `src/services/iap.ts` — Wrapper for react-native-iap (real purchases)
- `src/services/simulation.ts` — Simulated purchase/restore/lifecycle services
- `src/hooks/` — useMantle, useFeature, usePurchase hooks
- `src/types.ts` — All TypeScript types
- `src/__tests__/` — Test suite
