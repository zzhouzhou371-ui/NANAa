# Android Studio Workflow

Nana uses Expo SDK 55 Continuous Native Generation. The `android/` directory is
a local generated project, not the source of truth. Native configuration belongs
in `app.json`, Expo config plugins, and service boundaries.

## First Local Run

1. Install Android Studio, Android SDK 36, platform tools, and an emulator or
   connect a physical Android device.
2. Generate or synchronize the native project:

   ```powershell
   npm run android:generate
   ```

   The local generated project targets `arm64-v8a` physical devices and
   `x86_64` emulators. These are the Skia binaries present in the local
   installation and cover modern Android Studio testing. EAS builds remain
   clean-generated and are not restricted by this local setting.

3. Open the generated project:

   ```powershell
   npm run android:studio
   ```

4. Let Gradle sync finish, select the `app` configuration and a device, then
   press Run.
5. In a second terminal, start Metro for the development client:

   ```powershell
   npm run start:dev-client
   ```

## Command-Line Build Check

Before opening Android Studio, the same generated project can be compiled with:

```powershell
npm run android:build:debug
```

The debug APK is generated under `android/app/build/outputs/apk/debug/`.

## Regeneration Rule

After changing native dependencies, permissions, icons, package identifiers, or
Expo config plugins, regenerate the Android project. Do not keep manual changes
inside `android/`; move required native customization into config plugins first.

`npm run clean:generated` removes Gradle and C++ build caches but keeps the
generated Android source project so Android Studio can reopen it quickly.
