# core. (Expo)

The native core. app, rebuilt screen by screen on the same stack as Pulse. The Capacitor app in the repo root keeps working until this one reaches parity.

## One stack for pulse., nexus. and core.

| Layer | Choice (same in all three apps) |
| --- | --- |
| Framework | Expo SDK 58, React Native, Expo Router |
| Language | TypeScript, strict |
| Backend | Supabase (Auth, Postgres, Edge Functions) via `@supabase/supabase-js` 2.117.1 |
| Sessions | iOS keychain through `expo-secure-store`, chunked (shared adapter from Pulse) |
| Design | Science By Hugs Design System tokens in `src/theme.ts` (this app: core. Sage) |
| Builds | `eas build --platform ios --profile testflight --local` on a Mac or a GitHub-hosted Mac; no Expo cloud builds |
| Release | TestFlight upload with Apple's `altool`, triggered manually and approved by Anthony |

## What's here (first slice)

- Sign-in with a confirmed owner or admin account; anyone else is signed out.
- Home: what needs attention, last 7 days, recent orders (`core-dashboard`).
- Inventory: search, Low / Out / Not counted filters, on hand / reserved / available (`core-catalog`).
- Orders: latest 100, search/status filters, order detail, exact historical totals, invoice PDF access and delivery estimate editing (`core-orders`). Sandbox reservations have no delivery controls.
- Customers: search/membership filters, profile/history/referrals/rewards, profile/notes/contact editing through existing guarded endpoints. Membership/status/login-email changes remain in the current app.
- Payments (from Home): invoice search/status review and test submission/verification UI; writes default OFF until staging backend verification.
- Account: email, role, environment, sign out.

Not yet rebuilt: catalog editing, finance, analytics, referrals, notifications, admin tools and audit.

## Run it on your iPhone

```sh
cd expo
cp .env.example .env.local   # staging values only; production is refused
npm ci --legacy-peer-deps
npx expo run:ios --device    # or: eas build --platform ios --profile testflight --local
```

Before the first EAS build, link the project once with `eas init` (it adds the project ID to `app.json`). Dependencies are pinned in `package-lock.json`; use `npm ci --legacy-peer-deps` for a clean install.

## Staging rules

Same as the web app: the build refuses production Supabase projects, production keys and non-HTTPS backends, and every staging Edge Function also requires a confirmed synthetic staging account. The bundle id `com.sciencebyhugs.core.expo.staging` keeps this app separate from the Capacitor staging app on the same phone.

## Test payment gate

EXPO_PUBLIC_ENABLE_TEST_PAYMENTS defaults to false. Enable it only for an approved synthetic staging build after core-payment-control is reviewed and verified to use staging/sandbox targets. This client flag is not server authorization: owner/admin and staging/payment isolation must be enforced by the backend. No payment function is deployed by this app. The native view reads the latest 100 invoices.
