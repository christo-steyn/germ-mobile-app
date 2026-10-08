# Germ alarm notifications

A small Expo/React Native app and Express API for testing username/password login,
alarm subscriptions, and Expo push notifications on iOS and Android.

## Structure

- `backend/`: Express API, JWT authentication, scrypt password hashing, SQLite
  persistence, and Expo push delivery.
- `frontend/`: TypeScript Expo app, login/register screens, subscribed alarms,
  subscription management, and device notification registration.

## 1. Start the backend

Install **Node.js 24 or newer** (the API uses built-in `node:sqlite`) and npm.

```sh
cd backend
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `JWT_SECRET` in `.env`. Generate a **different**
value for `ALARM_ADMIN_KEY` if you want to activate test alarms. Never put either
secret in the app. With no admin key configured, alarm administration is disabled.

```sh
npm run dev
# or: npm start
```

The API listens on port 3000 on all interfaces. SQLite is created and three demo
alarms are seeded automatically. `DATABASE_PATH` changes the file location.
Persist and back up this file if you need to keep users and subscriptions.
Run commands from `backend/` so `.env` and the default database path resolve there.

## 2. Start the mobile app

```sh
cd frontend
npm ci
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` in `frontend/.env` to the reachable server base URL, without
`/api`, for example `http://192.168.1.20:3000`. Your computer and phone must be
on the same network, and your firewall must allow the backend port. A phone's
`localhost` points to the phone, not your computer. The Android emulator normally
uses `http://10.0.2.2:3000`; the iOS simulator can use `http://localhost:3000`.
Restart Expo after changing environment values.

Register a username (3–32 letters, numbers, underscores or hyphens) and a password
(8–128 characters). Use the subscriptions screen to select alarms and the home
screen to view subscribed alarms. Refresh to retrieve changes from the server.

JWTs are stored in **Expo SecureStore**, not unencrypted AsyncStorage.
AsyncStorage is used only for non-sensitive preferences. Expired JWTs require
signing in again; there is no refresh-token flow. Push registrations also expire
with the JWT that registered them (at most seven days), so expired sessions are
not targeted. Sign in and refresh push registration to renew delivery.
Logging out unregisters the
device token when the API is reachable. If the API is offline, local logout still
works, but that device may receive notifications until you reconnect and remove
or reassign its token, or that registration expires.

## 3. Enable real push notifications

Authentication and subscriptions can be explored in Expo Go, but **remote push
testing requires an Expo development build on a physical iOS or Android device**.
Do not rely on Expo Go or simulators for remote push delivery.

1. Create/sign in to an [Expo account](https://expo.dev/).
2. From `frontend/`, run `npx eas-cli@latest login` and
   `npx eas-cli@latest build:configure`, then `npx eas-cli@latest init`.
   This links your Expo project and sets `expo.extra.eas.projectId` in `app.json`.
3. The Expo development client and `development` build profile are included.
   Set the desired iOS bundle identifier and Android package name when prompted.
4. Follow Expo's
   [push setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/)
   to configure **FCM v1 credentials for Android** and **APNs credentials for iOS**.
   iOS device builds require an Apple Developer account and a registered device.
5. Build and install with `npx eas-cli@latest build --profile development --platform android`
   (or `ios`). Start Metro with `npx expo start --dev-client`.
6. Sign in, subscribe to an alarm, then tap the app's enable-notifications button
   and allow notification permissions. The app registers its Expo push token with
   the API. Denied permissions can be changed in device settings.

All `EXPO_PUBLIC_*` values are bundled into the client: **never put secrets in
them**. If you enable enhanced push security in your Expo project, set
`EXPO_ACCESS_TOKEN` only in `backend/.env`.

### Trigger a test alarm

With the app subscribed and notifications enabled, activate alarm 1 using the
backend-only admin key:

```sh
curl -X PATCH http://localhost:3000/api/admin/alarms/1 \
  -H "Content-Type: application/json" \
  -H "X-Alarm-Admin-Key: $ALARM_ADMIN_KEY" \
  -d '{"active":true}'
```

Export `ALARM_ADMIN_KEY` in your shell first; editing `.env` does not export it to
your shell. The response includes the alarm and Expo ticket counts (`sent`,
`failed`). `sent` means Expo accepted the message, **not confirmed device
delivery**. Set `active` to `false`, then `true`, to send another notification.
Only inactive-to-active transitions send pushes, and only subscribers' registered
devices are targeted. Delivery errors do not roll back the alarm state.

The API polls Expo receipts once a minute for tickets at least 15 minutes old,
removes unregistered devices, and expires pending receipts after 24 hours.
Receipts survive backend restarts in SQLite. Use the Expo push dashboard and
device permission/credential checks to diagnose delivery problems.

## API

All bodies and error responses are JSON. Except for health and authentication,
user routes require the JWT in the `Authorization` header using the `Bearer` scheme.

| Method | Path | Purpose/body |
| --- | --- | --- |
| GET | `/health` | Readiness check |
| POST | `/api/auth/register` | `{ "username": "...", "password": "..." }` |
| POST | `/api/auth/login` | Same body; returns `{ token, user }` |
| GET | `/api/auth/me` | Current user |
| GET | `/api/alarms` | `{ alarms: [...] }` |
| GET | `/api/subscriptions` | `{ subscriptions: [...] }` (alarm objects) |
| POST | `/api/subscriptions` | `{ "alarmId": 1 }`; idempotent |
| DELETE | `/api/subscriptions/:id` | Unsubscribe current user |
| POST | `/api/push-tokens` | `{ "token": "ExpoPushToken[...]" }` |
| DELETE | `/api/push-tokens` | Same body; unregister current user's device |
| PATCH | `/api/admin/alarms/:id` | `{ "active": true }`; requires `X-Alarm-Admin-Key` |

Usernames are case-insensitive. A device token belongs to one account at a time;
registration on another account moves that token to the new account. Different
devices may register with the same account.

## Verification

```sh
cd backend
npm test
npm audit

cd ../frontend
npm run typecheck
npx expo export --platform android --output-dir dist/android
npm audit
```

Backend tests use in-memory SQLite, real HTTP requests, and mocked Expo transport;
they do not send notifications or require credentials. A bundle export verifies
JavaScript packaging, not native signing or delivery. Final notification testing
must be performed on configured physical devices.

The frontend audit still reports **21 findings (18 high, 3 moderate)**, cascading
from three transitive dependencies:

- Expo's build tooling uses `braces` and `node-forge` versions with advisories
  and no patched releases. Do not expose Metro to untrusted networks or process
  untrusted build inputs/signing certificates.
- Expo Router's `query-string` dependency uses an affected `decode-uri-component`.
  Its patched 0.5 release changes to ESM and breaks the CommonJS caller; a tested
  override was reverted to keep navigation functional. Avoid untrusted deep links
  in this test app; this advisory must be resolved before production use.

A scoped override updates Xcode tooling's `uuid` dependency to a patched,
compatible release. Review `npm audit` before deploying and update the SDK when
compatible fixes become available; `npm audit fix --force` currently proposes
incompatible SDK downgrades.

## Development versus production

This is a test backend, not a production alarm-monitoring system. HTTP LAN URLs
are for local development only; use **HTTPS** for deployed APIs and supported
device builds. Native platforms may block cleartext traffic in standalone builds;
use an HTTPS development endpoint rather than weakening release security.
Use HTTPS to avoid exposing passwords and tokens in transit.

The API validates inputs, limits request sizes and request rates, uses parameterized
SQL, and rejects missing/weak JWT secrets. Native clients do not need CORS; set
`CORS_ORIGIN` to an exact browser origin only when needed. Rate limits use an
in-memory store; configure a shared store and trusted proxy settings deliberately
before scaling behind a proxy. Keep the admin endpoint/key on a trusted network.

For production, add operational monitoring, password recovery, token revocation,
an alarm event source, and a durable push worker/retry policy. Alarm state and
push submission are not transactional, so a crash between them can miss a push.
SQLite is suitable for one development server; moving to PostgreSQL requires
replacing `backend/src/database.js` and SQL calls/migrations (changing an environment
variable alone does not switch databases).
