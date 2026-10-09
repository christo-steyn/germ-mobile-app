# Frontend setup, devices, and publishing

## Local setup

Use Node.js 22 LTS (22.13+) or 24 LTS (24.3+) and npm.
Start the backend first (see [backend guide](BACKEND_SETUP.md)).

```sh
npm --prefix frontend ci
cp frontend/.env.example frontend/.env
```

Set `EXPO_PUBLIC_API_URL` to `http://10.0.2.2:3000` for an Android emulator,
`http://localhost:3000` for an iOS simulator on the same Mac, or your computer's
LAN address for a phone. A phone's `localhost` is the phone, not your computer.
Keep phones and the computer on the same network and permit port 3000 through
your development firewall. Never put backend secrets into `EXPO_PUBLIC_*`
variables: they are included in the app bundle.

```sh
npm --prefix frontend start
```

Restart Metro after changing `.env`; use `npx expo start --clear` from `frontend`
if cached configuration persists. Metro normally listens on port 8081.
Register a user or use the development seed login `demo` / `DemoPassword123!`.

## Android Studio emulator

1. Install [Android Studio](https://developer.android.com/studio), including the
   Android SDK, platform tools, and Android Emulator.
2. In **Device Manager**, create a Pixel virtual device with a recent supported
   Android system image. Enable hardware virtualization if necessary.
3. Start the virtual device. `adb devices` should list it.
4. Use `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`.
5. Run the frontend and press **a** to open the app.

Expo Go can be used for basic UI/authentication checks with an SDK-compatible
version, but **remote push notifications are not supported in Expo Go**. Use a
development build for notification testing. Treat emulator checks as UI/API
tests; validate actual remote delivery on a physical phone.

For a local Android development build (Java/Android SDK required):

```sh
cd frontend
EAS_BUILD_PROFILE=development npx expo run:android
npx expo start --dev-client
```

The development profile enables Android cleartext traffic for local testing only.
Use the environment variable above for local native builds too (on PowerShell:
`$env:EAS_BUILD_PROFILE="development"`). Release builds retain network security;
use HTTPS outside local development. `adb reverse tcp:3000 tcp:3000` can forward a connected Android
device's port, but does not override Android's HTTP security policy.

### Manual regression checklist

- Register with matching passwords; verify invalid input is explained.
- Log in, close/reopen the app, and verify the session is restored.
- Browse alarms, subscribe, and confirm the alarm appears on Home.
- Unsubscribe and confirm it disappears from Home.
- Check profile and logout; log in as a different user and verify isolation.
- Stop the API and verify useful errors and retry behavior.
- Allow/deny notifications and verify either outcome does not prevent login.
- On a configured physical device, send a backend test push for a subscribed alarm.
- Log out and confirm that device is no longer registered to the old account.

If device deregistration or saved-credential removal fails, logout keeps you
signed in and shows a retry warning. Restore connectivity and try again. An expired
JWT cannot deregister a device: sign in again to retry cleanup, or disable this
app's notifications in device settings until cleanup succeeds.

## Expo/EAS push configuration

1. Create an Expo account and an EAS project:

   ```sh
   cd frontend
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

2. Set `EXPO_PUBLIC_EXPO_PROJECT_ID` in `.env` to the project's real UUID.
   Review `app.json` / `app.config.js` and choose permanent Android package and iOS
   bundle identifiers that you own before creating signing credentials.
3. Configure Android **FCM v1** credentials and iOS **APNs** credentials through
   EAS. Follow [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).
   Keep service-account keys and signing certificates out of Git.
4. Build a development client:

   ```sh
   npx eas-cli@latest build --platform android --profile development
   # Or, after registering an iOS device:
   npx eas-cli@latest device:create
   npx eas-cli@latest build --platform ios --profile development
   npx expo start --dev-client
   ```

Install the development build from EAS on the device, then open the Metro project.
Use a reachable API URL in the build environment as well as locally. Public env
variables are baked into builds; changing a server `.env` does not update an
already-installed app. Notification permission and the EAS project ID are required
for token registration. The app handles foreground notifications and cleans up
its listeners when the session ends.

## iOS physical devices

EAS cloud builds do not require a Mac, but a paid Apple Developer membership is
needed for EAS device signing and store distribution. Register the device with
`eas device:create`, build using the development profile, and install the resulting
build on that registered device. Enable **Developer Mode** if iOS requests it.
On a Mac, Xcode and `npx expo run:ios --device` are an alternative local workflow.

Expo Go is useful for basic screens, not for validating the app's remote push
credentials. Test both foreground/background notifications on a real iPhone,
then use TestFlight to validate the release build and production API.

## Google Play and Apple App Store

Before submission:

- Deploy the backend at a stable HTTPS URL and set the production build's
  `EXPO_PUBLIC_API_URL` and EAS project ID.
- Replace default artwork, configure your own permanent bundle/package IDs,
  and set app version plus Android version code / iOS build number.
- Complete privacy policy, support URL, data-safety/privacy forms, content ratings,
  and permission explanations. Do not claim the app collects no data: it stores
  usernames, email addresses, passwords as hashes, and device notification tokens.
- Implement and test account deletion before submitting a public app with signup.
  This starter does not yet supply an account-deletion endpoint/UI.
- Arrange production alarm ingestion, operational monitoring, backups, and push
  retries appropriate for your service. Do not enable the development testing API.

The included `eas.json` has development, preview, and production profiles.
Set the public configuration in the corresponding EAS environment before builds.
Review the [EAS environment guide](https://docs.expo.dev/eas/environment-variables/).

```sh
cd frontend
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform android --latest
npx eas-cli@latest submit --platform ios --latest
```

For **Google Play**, create a Play Console account and app, upload the signed AAB
to internal testing first, supply screenshots/listing information, and fulfill the
current testing and target-SDK requirements for your account. The first upload may
need to be done manually in Play Console before automated submission.

For **Apple**, create an App Store Connect app with the matching bundle ID,
submit a production build to TestFlight, supply a working review login if needed,
and complete the listing before requesting App Review. EAS upload does not itself
publish the app; complete the release workflow in the appropriate console.
Review times, fees, screenshot requirements, and testing rules change: consult the
stores' current requirements rather than relying on a fixed timeline.

## Troubleshooting and validation

- API unreachable: check device-reachable URL, backend bind address, firewall,
  HTTPS/cleartext policy, and network.
- Invalid/expired session: log in again; check the backend JWT configuration.
- No push token: use a physical device and development build, check notification
  permission, the real EAS project ID, and APNs/FCM credentials.
- Push accepted but not received: inspect Expo tickets/receipts and device
  notification settings; acceptance is not delivery confirmation.
- Native dependency changed: rebuild the development client, not just Metro.

```sh
npm --prefix frontend test
cd frontend
npx expo config --type public
npx expo export --platform all
```

Bundle export checks JavaScript compilation, not signing, emulator behavior,
notification delivery, or store acceptance. Those require the device and release
tests above. Generated bundles and native projects are ignored by Git.
