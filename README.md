# Germ Mobile App

An Expo React Native alarm subscription app and an Express/SQLite API.
Users register or log in with JWT authentication, browse alarms, manage their
subscriptions, and receive Expo push notifications on Android and iOS.

## Quick start

Use Node.js **22 LTS (22.13+) or 24 LTS (24.3+)** and npm. From the repository root:

```sh
npm run setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Set the generated value as `JWT_SECRET` in `backend/.env`. Set the frontend
`EXPO_PUBLIC_API_URL` to a URL reachable from your device:

| Client | Local backend URL |
| --- | --- |
| Android Studio emulator | `http://10.0.2.2:3000` |
| iOS simulator on the backend's Mac | `http://localhost:3000` |
| Physical Android/iOS device | `http://YOUR_COMPUTER_LAN_IP:3000` |
| Production | Your public **HTTPS** API URL |

```sh
npm run seed
npm run backend
# In a second terminal:
npm run frontend
```

The API listens on port **3000**; Metro normally uses **8081**. Development
seed credentials: **demo / DemoPassword123!**. Never seed a production database.
The frontend uses the same backend seed data, not a separate mock login.

## Guides

- [Backend setup, API examples, and tests](BACKEND_SETUP.md)
- [Android emulator, iOS devices, push notifications, and publishing](FRONTEND_SETUP.md)
- [Backend configuration reference](backend/README.md)

## Layout

```text
backend/
  server.js
  config/          # Environment and database configuration
  middleware/      # JWT authentication and request protections
  models/          # SQLite schemas and queries
  controllers/     # Business logic
  routes/          # Express routes
  test/            # API regression tests
frontend/
  App.js
  api/             # Token-aware API client
  components/      # Reusable cards, loading, and error handling
  context/         # Authentication, alarms, and subscriptions
  navigation/      # Authentication stack and bottom tabs
  screens/
  utils/           # Notification registration and listeners
```

## Validation

```sh
npm test
```

The individual packages also expose their own validation commands. Real remote
push delivery needs Expo/EAS credentials and device testing; automated tests
do not establish that Apple or Google delivery is configured.

## Deployment boundaries

This is a runnable foundation, not a hosted service. Before exposing it publicly,
configure HTTPS, a strong JWT secret, restricted CORS, persistent storage and
backups, monitoring, and notification credentials. Test-only alarm creation and
notification sending must remain disabled in production. SQLite suits local
development and a single server; use a database and job queue appropriate to
your traffic for a larger deployment.

Before store submission, supply your own signing credentials, icons, screenshots,
support/privacy URLs, account deletion workflow, and store privacy declarations.
See the frontend guide for the build and submission process.
