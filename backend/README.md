# GERM backend

Node.js 22.13+ and npm are required (SQLite and bcrypt use native addons).

```sh
cd backend
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# Set JWT_SECRET in .env to the generated value; never commit .env.
npm run seed
npm start
```

`npm run dev` starts Node's file watcher. `npm run check` checks JavaScript
syntax. `npm test` runs real HTTP API tests with an isolated SQLite file under
`.test-data/`, random test-only signing keys and a stub Expo client. Tests delete
their databases afterward and never send real notifications.
From the repository root, use `npm --prefix backend run check`,
`npm --prefix backend test`, `npm --prefix backend run seed` and
`npm --prefix backend start`.

## Configuration

See `.env.example`. `PORT` defaults to 3000; `DB_PATH` defaults to
`backend/data/germ.sqlite` and its directory is created automatically. A relative
`DB_PATH` always resolves against the backend directory, independently of the
process working directory. Startup and seeding load `backend/.env` explicitly.
Absolute database paths are also supported. SQLite enables foreign
keys and a five-second busy timeout. Keep this database on persistent storage.

`JWT_SECRET` has no fallback and must contain at least 32 UTF-8 bytes of
independently generated random material. Length checks cannot prove entropy;
generate a fresh secret as above. JWTs use HS256, a one-hour expiry, explicit
issuer/audience verification and required issued-at/expiry claims. Rotating the
secret invalidates existing sessions. `EXPO_ACCESS_TOKEN` optionally enables
Expo enhanced push security; keep it private.

`CORS_ORIGINS` is a comma-separated allowlist of exact browser origins; `*` is
rejected. An empty list disables browser cross-origin access. Native apps without
an Origin header still work. CORS is not an authentication mechanism.

`ENABLE_TEST_ENDPOINTS=true` enables alarm creation and test pushes **only when
`NODE_ENV` is not `production`**. These routes additionally require a valid login.
Do not expose a development server or its testing routes publicly.

## API contract

All requests/responses use JSON except successful DELETE responses (204).
Protected endpoints require the `Authorization` header with the `Bearer`
scheme followed by a space and the JWT.
Errors use `{ "error": "message" }`; internal/provider details are never returned.

| Method and path | Request | Successful response |
| --- | --- | --- |
| `GET /health` | None, public | `{status:"ok"}` |
| `POST /auth/register` | `{username,email,password}` | 201 `{token,user}` |
| `POST /auth/login` | `{username,password}` | `{token,user}` |
| `GET /api/user/profile` | None | `{user}` |
| `GET /api/alarms` | None | `{alarms:[alarm]}` |
| `GET /api/alarms/:id` | None | `{alarm}` |
| `POST /api/alarms` | `{name,description,severity}`; testing only | 201 `{alarm}` |
| `GET /api/subscriptions` | None | `{subscriptions:[subscription]}` |
| `POST /api/subscriptions` | `{alarmId}` | 201 `{subscription}`; 200 if already subscribed |
| `DELETE /api/subscriptions/:alarmId` | None | 204, idempotent |
| `POST /api/notifications/token` | `{token}` | `{success:true}` |
| `DELETE /api/notifications/token` | `{token}` | 204, removes only the caller's owned token |
| `POST /api/notifications/send` | `{alarmId,title?,body?}`; testing only | `{notification:{alarmId,recipients,accepted,failed}}` |

`user` contains only `{id,username,email,createdAt}`; no password/hash is exposed.
`alarm` contains `{id,name,description,severity,createdAt}`.
`subscription` contains `{id,alarmId,createdAt,alarm}`; **the alarm is nested**.
SQLite stores subscription timestamps as `subscribed_at`, mapped to `createdAt`
in API responses. An older local subscription `created_at` column is
automatically renamed on database initialization.
IDs are positive integers (numeric strings also accepted), up to 15 digits.
List endpoints return all matching records, newest first; there is no pagination
in this development API. Large datasets require a future paginated contract
rather than silently truncating these lists.

Registration usernames are 3–40 characters from letters, digits, `_`, `.` and
`-`. Usernames/emails are case-insensitively unique. Email is at most 254
characters and syntax-validated (not ownership-verified). Passwords are at least
8 characters and **at most 72 UTF-8 bytes**, avoiding bcrypt truncation; passwords
are not trimmed. bcrypt uses cost 12. Login errors do not reveal whether a user
exists. Alarm names/titles are at most 120 characters; descriptions/bodies are
at most 2000. Severity is `low`, `medium`, `high` or `critical`. Request bodies
must be objects containing only documented fields.

## Development data

Seeding is explicit, never part of startup, and refuses `NODE_ENV=production`.
`npm run seed` inserts a demo user if absent and example alarms if none exist.
It does not overwrite existing credentials or subscribe users automatically.

**Development-only demo login:** username `demo`, password `DemoPassword123!`.
Never seed a production database or reuse this password for real users.

## Notifications

Use Expo push tokens from the mobile app, not native APNs/FCM tokens.
The Expo SDK validates token format. Each token has exactly one owner;
registering it after account switching transfers it to the new authenticated
user. Logout should DELETE the token before discarding the JWT. An old account
cannot remove a transferred token. Multiple distinct device tokens per user
are supported. Only tokens belonging to currently subscribed users are
selected; tokens are deduplicated. The send endpoint never accepts recipient
tokens.

Messages include `data.alarmId`, the receiving account's `data.userId`, and
Android `channelId: "alarms"` to match the mobile app's notification channel.
Clients should verify `data.userId` against the active account before handling
notification taps, because an already queued push cannot be recalled on account
switching. Tickets are matched to messages by index.
`accepted` means Expo accepted a ticket, **not guaranteed delivery**.
Provider request failures and rejected tickets increment `failed`. No raw
provider messages, credentials or recipient tokens are returned.
`DeviceNotRegistered` removes matching tokens on both tickets and receipts.
Receipt IDs are persisted in SQLite, checked after 15 minutes and polled every
minute; transient/missing receipts retry until a 24-hour expiry. Receipts from
old token registrations cannot delete a token transferred/re-registered later.
Other permanent receipt errors are consumed without deleting valid tokens.
Receipts resume after restart. There is no durable message outbox or delivery
retry; client/manual retry can duplicate a push after an uncertain result.

`createApp({config, db?, expo?, receiptDelayMs?})` supports deterministic test
injection. `app.locals.processReceipts()` exposes the receipt polling operation.
Test pushes are limited to 1000 recipients and one active batch per process.

## Production limitations and operations

Use HTTPS at a trusted ingress and `NODE_ENV=production`. This API deliberately
does not implement a production admin alarm-ingestion service, email verification,
password reset, refresh/revocable sessions, granular roles or a durable push
queue. Creating alarms and sending pushes are disabled in production; alarms
must be provisioned by a trusted separate operator/import process.
Deleting a push token does not revoke its JWT. Account switching requires
registering the current device token under the new account.

Helmet sets security headers. JSON bodies are capped at 16 KiB. The shared
authentication limiter permits 20 attempts per IP per 15 minutes, the global
limiter 120 requests per IP per minute, and testing mutations 10 per IP per
minute. These in-memory limits are per process, not a distributed anti-abuse
solution. Express does not trust forwarded IP headers: deploying behind an
ingress shares limits by proxy IP unless an operator securely configures trust
for the actual proxy topology. Never blindly trust arbitrary forwarding headers.
Database and receipts are stored unencrypted; use host/disk access controls,
backups, secret management and an appropriate retention policy. SQLite is
appropriate for a small single-instance deployment, not high-scale distributed
workloads. Pagination and a real delivery worker are needed at larger scale.

SIGINT/SIGTERM stop accepting requests and close SQLite, with a 10-second
shutdown deadline. `/health` checks database connectivity but does not check
Expo reachability. The API uses no automatic seed or example secret.
