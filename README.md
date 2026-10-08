# Germ Mobile App

React Native mobile app with Expo for alarm notifications and subscription management. Includes a Node.js/Express backend for authentication and push notifications.

## Project Structure

```
germ-mobile-app/
├── backend/              # Node.js/Express API server
│   ├── src/
│   │   ├── server.js     # Main server file
│   │   ├── auth.js       # JWT authentication logic
│   │   ├── database.js   # Database setup
│   │   └── routes/       # API routes
│   ├── package.json
│   ├── .env.example
│   └── README.md         # Backend setup instructions
└── frontend/             # Expo React Native app
    ├── app/
    ├── components/
    ├── screens/
    ├── context/          # Context API for state management
    ├── api/              # API client
    ├── app.json          # Expo configuration
    ├── package.json
    └── README.md         # Frontend setup instructions
```

## Quick Start

### Prerequisites

- Node.js 16+ and npm/yarn
- Git
- Android Studio (for Android simulator) or Xcode (for iOS)
- Expo CLI: `npm install -g expo-cli`

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

The backend will run on `http://localhost:3000`

### 2. Frontend Setup

```bash
cd frontend
npm install
# Update API_URL in .env to point to your backend
expo start
```

## Testing on Android Simulator

### Setup Android Emulator (One-time)

1. **Install Android Studio**
   - Download from [android.com](https://developer.android.com/studio)
   - Install with Android SDK and emulator

2. **Create a Virtual Device**
   - Open Android Studio → AVD Manager
   - Click "Create Virtual Device"
   - Choose a device (e.g., Pixel 5)
   - Select API level 31 or higher
   - Click "Finish"

3. **Start the Emulator**
   ```bash
   # List available emulators
   emulator -list-avds
   
   # Start an emulator (replace "Pixel_5_API_31" with your device name)
   emulator -avd Pixel_5_API_31
   ```

### Run App on Android Simulator

```bash
cd frontend
expo start

# Once Expo dev server is running:
# - Press 'a' to open in Android emulator (must already be running)
# OR
# - Scan QR code with Expo Go app (installed on emulator)
```

**Testing Push Notifications on Android:**
- Notifications will appear in the system tray
- Test by triggering alarms from the backend or admin panel
- Check notification handling in the app

### Troubleshooting Android

- **Emulator won't start**: Check Android SDK path in Android Studio settings
- **Metro bundler issues**: Clear cache with `expo start --clear`
- **Notifications not working**: Verify backend is running and accessible from emulator (use `10.0.2.2` instead of `localhost`)

## Testing on iOS Device

### Prerequisites

- Mac with Xcode installed
- Apple Developer account (free or paid)
- Physical iPhone or iPad

### Setup for Physical iOS Device

1. **Install Xcode**
   ```bash
   xcode-select --install
   ```

2. **Install CocoaPods**
   ```bash
   sudo gem install cocoapods
   ```

3. **Connect iOS Device**
   - Plug in iPhone via USB
   - Open Xcode → Window → Devices and Simulators
   - Verify device is connected and trusted

4. **Enable Developer Mode (iOS 16+)**
   - Settings → Privacy & Security → Developer Mode
   - Toggle on and restart

5. **Build for iOS Device**
   ```bash
   cd frontend
   eas build --platform ios --device
   
   # Or use Expo Go app for testing:
   expo start
   # Scan QR code with iPhone camera → Tap "Open with Expo Go"
   ```

### Testing Push Notifications on iOS

- Notifications require signed credentials for production testing
- Use EAS (Expo Application Services) for building with proper certificates
- Test with development builds or TestFlight

## Publishing to App Stores

### Google Play Store (Android)

#### Prerequisites

- Google Play Developer Account ($25 one-time fee)
- Signed APK/AAB build

#### Steps

1. **Prepare Your App**
   ```bash
   cd frontend
   
   # Create EAS configuration
   eas build --platform android --type release
   ```

2. **Generate Keystore** (first time only)
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias my-key-alias
   ```

3. **Build Release APK**
   ```bash
   # Using EAS (recommended)
   eas build --platform android --type release
   
   # Or manually with Expo
   expo build:android -t app-bundle
   ```

4. **Upload to Google Play**
   - Go to [Google Play Console](https://play.google.com/console)
   - Create new app
   - Fill in app details, screenshots, description
   - Upload AAB file to "Internal testing" → "Staging" → "Production"
   - Submit for review (typically 2-3 hours)

#### Detailed Requirements

- App icon (512x512 png)
- Screenshots (5+ per device type)
- 80 character max app title
- 4000 character description
- Privacy policy URL
- Content rating questionnaire

### Apple App Store (iOS)

#### Prerequisites

- Apple Developer Account ($99/year)
- Mac with Xcode
- iOS Developer Certificate
- App Store Connect access

#### Steps

1. **Prepare Your App**
   ```bash
   cd frontend
   
   # Create EAS configuration for iOS
   eas build --platform ios --type release
   ```

2. **Set Up App Store Connect**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Click "My Apps" → "+"
   - Create new app
   - Fill in bundle ID, app name, SKU
   - Choose category

3. **Configure App Information**
   - Screenshots (6 per device size: iPhone 5.5", 6.7", etc.)
   - App preview video (optional but recommended)
   - Description (4000 char max)
   - Keywords
   - Support URL
   - Privacy policy URL

4. **Build and Submit**
   ```bash
   # Using EAS (recommended)
   eas build --platform ios --type release
   
   # Then use Xcode or EAS to submit
   eas submit --platform ios
   ```

5. **TestFlight Beta Testing** (before App Store)
   ```bash
   # Upload build to TestFlight first
   eas submit --platform ios --latest
   
   # Invite testers and gather feedback
   # Use Xcode organizer to manage builds
   ```

6. **App Store Review**
   - Apple reviews all apps (usually 24-48 hours)
   - Common rejection reasons: privacy policies, permission justification, etc.
   - Address feedback and resubmit

#### Important iOS Requirements

- Push Notification certificate setup via App Store Connect
- Privacy policy linked at signup
- Clearly explain why app needs permissions
- App icons for all sizes
- Proper app rating (IARC questionnaire)

## Environment Variables

### Backend (.env)

```
PORT=3000
NODE_ENV=development
JWT_SECRET=your_secret_key_here
DATABASE_PATH=./db.sqlite
EXPO_ACCESS_TOKEN=your_expo_token_for_notifications
```

### Frontend (.env)

```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id
```

## Development Workflow

### Backend Development

```bash
cd backend
npm run dev        # Start with nodemon for auto-reload
npm test           # Run tests
npm run lint       # Lint code
```

### Frontend Development

```bash
cd frontend
expo start         # Start Expo dev server
npm test           # Run tests
npm run lint       # Lint code
```

## Key Features

- ✅ User authentication with JWT
- ✅ Alarm subscription management
- ✅ Push notifications via Expo
- ✅ Cross-platform (iOS/Android)
- ✅ Context API state management
- ✅ Error handling and validation
- ✅ Development and production builds

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Metro bundler crashes | Run `expo start --clear` |
| Android emulator won't connect | Ensure backend is accessible at `10.0.2.2:3000` |
| Notifications not working | Verify Expo token and backend configuration |
| iOS simulator stuck | Kill Xcode processes: `killall com.apple.CoreSimulator.CoreSimulatorService` |
| Build fails on iOS | Run `cd ios && pod install && cd ..` |

## Additional Resources

- [Expo Documentation](https://docs.expo.dev)
- [React Native Docs](https://reactnative.dev)
- [Google Play Publishing](https://developer.android.com/studio/publish)
- [App Store Submission](https://developer.apple.com/app-store/submission/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

## License

MIT
