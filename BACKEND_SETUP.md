# Backend setup

## Install and configure

Use Node.js 22 LTS (22.13+) or 24 LTS (24.3+) and npm. From the repository root:

```sh
npm --prefix backend ci
cp backend/.env.example backend/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Paste the generated value into `JWT_SECRET`. Do not commit `.env`.
See [`backend/.env.example`](backend/.env.example) for the authoritative variables
and [`backend/README.md`](backend/README.md) for configuration details.
Use `NODE_ENV=development` and `ENABLE_TEST_ENDPOINTS=true` for the examples below.

```sh
npm --prefix backend run seed
npm --prefix backend run dev
```

Development seed credentials are `demo` / `DemoPassword123!`. The seed creates
sample alarms for both API tests and the mobile UI. Do not enable seed users
or testing endpoints in production.

## Postman / Insomnia / curl

Use `http://localhost:3000` as the base URL. Set `Content-Type: application/json`
on JSON requests. Log in:

```sh
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"DemoPassword123!"}'
```

Copy the returned `token` into Postman/Insomnia's bearer-token authorization,
or set `TOKEN` in your shell. Substitute an actual alarm ID from the alarms list.

```sh
curl http://localhost:3000/api/user/profile --oauth2-bearer "$TOKEN"
curl http://localhost:3000/api/alarms --oauth2-bearer "$TOKEN"
curl http://localhost:3000/api/alarms/1 --oauth2-bearer "$TOKEN"
curl -X POST http://localhost:3000/api/subscriptions \
  --oauth2-bearer "$TOKEN" -H 'Content-Type: application/json' \
  -d '{"alarmId":1}'
curl http://localhost:3000/api/subscriptions --oauth2-bearer "$TOKEN"
curl -X DELETE http://localhost:3000/api/subscriptions/1 \
  --oauth2-bearer "$TOKEN"
```

### Endpoint reference

| Method | Path | JSON body / purpose |
| --- | --- | --- |
| POST | `/auth/register` | `{ "username", "email", "password" }` |
| POST | `/auth/login` | `{ "username", "password" }` |
| GET | `/api/user/profile` | Current user's safe profile |
| GET | `/api/alarms` | List alarms |
| GET | `/api/alarms/:id` | Single alarm |
| POST | `/api/alarms` | `{ "name", "description", "severity" }`; development testing only |
| GET | `/api/subscriptions` | Current user's subscriptions, with nested `alarm` |
| POST | `/api/subscriptions` | `{ "alarmId": 1 }` |
| DELETE | `/api/subscriptions/:alarmId` | Remove own subscription |
| POST | `/api/notifications/token` | `{ "token": "ExponentPushToken[...]" }` |
| DELETE | `/api/notifications/token` | Same body; remove own device at logout |
| POST | `/api/notifications/send` | `{ "alarmId": 1, "title": "Test", "body": "Check alarm" }`; testing only |

All `/api` routes require a bearer JWT. Auth responses contain `{token,user}`;
lists use `{alarms}` or `{subscriptions}`. Never send a raw password to logs.

### Send a real test notification

1. Follow the frontend guide to configure a development build on a physical device.
2. Log in on that device and allow notifications; registration sends its Expo token
   to the API automatically.
3. Subscribe to an alarm.
4. Send a test push for that alarm using the same alarm ID:

```sh
curl -X POST http://localhost:3000/api/notifications/send \
  --oauth2-bearer "$TOKEN" -H 'Content-Type: application/json' \
  -d '{"alarmId":1,"title":"Alarm test","body":"Test notification"}'
```

Only users subscribed to that alarm are recipients. An accepted Expo ticket is
not proof that the device received the notification. Check device permissions,
network connectivity, Expo receipts, and APNs/FCM credentials when troubleshooting.

## Tests and production

```sh
npm --prefix backend test
npm --prefix backend run check
```

Tests use isolated temporary SQLite databases and mocked push delivery, not a live
Expo service. Run the mobile device test above separately.

Use `NODE_ENV=production`, disable testing endpoints, and deploy behind HTTPS.
Configure a restricted browser-origin list, persistent database storage, backups,
process supervision, and secrets through your hosting platform. Never expose the
development database or seed script. A production alarm source should call the
notification service from trusted server-side code, not enable the testing route.
For guaranteed delivery/retries at scale, integrate a durable queue and receipt
worker; do not interpret a successful HTTP response as guaranteed push delivery.
