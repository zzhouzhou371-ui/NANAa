# Physical Device Test Checklist

Use this checklist before starting UI polish.

## Today: Preview APK Path

Expo Go is not the target for this SDK 55 project. For UI and flow testing,
prefer a preview APK because it does not need Metro, QR scanning, LAN access, or
a dev-client connection.

1. Build and install a preview APK:
   - Android cloud build: `npm run build:android:preview`
   - Direct EAS command: `npx eas-cli build -p android --profile preview`
2. Open the installed preview app on the phone.
3. Test these flows first:
   - Home screen opens without clipping around the notch.
   - WeChat opens and returns correctly.
   - Chat input, emoji panel, voice panel, and plus menu switch cleanly.
   - Voice call and video call overlays stay inside the phone frame.
   - World Book memory records, summary, and context preview open on device.
   - Character media ability settings save and show in profile.

## Keep Mocked For This Round

- Real microphone recording.
- Speech-to-text.
- Character TTS playback.
- Camera perception.
- Video persona rendering.

Those are represented by `src/services/mediaRuntime.ts` and should not request
native permissions during this round.

## When To Use Dev Client

Use `npm run start:dev-client` only after installing a development build. This
project uses SDK 55, so the development build path is useful when native APIs
are introduced or when native modules need live debugging.

The previous `@react-native-voice/voice` dependency was removed from this round
because its Android Gradle config is not compatible with the current SDK 55
build chain. Add the real native voice route later with an SDK-compatible module
or a maintained Expo module.

## Pass Criteria

- No startup crash on phone.
- No permanent blank screen after opening each app.
- Back/close interaction returns to the expected screen.
- Dynamic island messages do not cover the notch.
- Media mock flows do not trigger microphone or camera permission prompts.

## Fallback: Development Build

Use this only when a preview APK is not enough:

1. Android cloud build: `npm run build:android:dev`
2. Open the installed development build on the phone.
3. Run `npm run start:dev-client`.
4. Connect through the development build launcher.

If LAN connection fails, use USB/ADB reverse or tunnel mode. The preview APK
route avoids those connection problems for normal UI testing.
