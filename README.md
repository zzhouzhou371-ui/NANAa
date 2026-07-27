# Nana RN

Nana is an Expo/React Native role-play app built around a simulated phone shell.
The first major surface is a WeChat-like experience for chatting with custom AI
characters, managing character memory, editing world-book entries, and preparing
native-capable photo, microphone, camera, call, and relationship-memory flows.

## Stack

- Expo SDK 55
- React Native 0.83
- React 19
- Expo Router
- Zustand with AsyncStorage persistence
- NativeWind and React Native style objects
- EAS Build for Android preview and development builds

## Project Shape

- `src/app/_layout.tsx` sets up the simulated phone frame, app context, safe
  areas, hardware back behavior, and router stack.
- `src/app/index.tsx` is the route-only home entry.
- `src/screens/home/index.tsx` renders the phone home screen and app overlay.
- `src/stores/nanaStore.ts` owns persisted product data and transient app state.
- `src/components/WeChatRootView.tsx` owns the WeChat-like app surface.
- `src/services/ai.ts` builds AI context and talks to Gemini or OpenAI-compatible
  chat-completions APIs.
- `src/services/mediaRuntime.ts` is the boundary for voice, camera, and video
  features. UI components should call this layer instead of native modules.

## Development

Install dependencies:

```bash
npm install
```

Start the web preview:

```bash
npm run web
```

Start Metro for a development client:

```bash
npm run start:dev-client
```

Generate the local Android project and open it in Android Studio:

```bash
npm run android:generate
npm run android:studio
```

Remove rebuildable caches, old smoke output, and temporary web exports:

```bash
npm run clean:generated
```

Build Android preview APK:

```bash
npm run build:android:preview
```

Run lint:

```bash
npm run lint
```

## Native Media Direction

This project targets Expo SDK 55. Before changing native media code, read the
versioned Expo docs under `https://docs.expo.dev/versions/v55.0.0/`.

Current native mappings:

- Voice recording and playback: `expo-audio`
- Camera capture and camera permission: `expo-camera`
- Video persona playback: `expo-video`
- Photo library and system camera selection: `expo-image-picker`
- Durable local media: `expo-file-system`
- API-secret storage: `expo-secure-store`

Keep native permission requests behind the runtime boundary in
`src/services/mediaRuntime.ts`. Do not wire microphone, camera, or video modules
directly inside chat components.

After adding or changing native modules, create a new development or preview
build. Expo Go is not the target runtime for this project.
