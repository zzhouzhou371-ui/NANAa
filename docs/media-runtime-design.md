# Media Runtime Design

Nana's core media runtime is native-capable on Expo SDK 55. UI consumes
normalized service results; native modules do not leak into store data shapes.

## Runtime Surface

- `mediaRuntime.ts`: permissions, normalized capture/session types, voice drafts,
  chat reply preferences, and call state helpers.
- `nativeImagePickerRuntime.ts`: system library/camera picker, Android pending
  result recovery, and target-chat recovery.
- `nativeAudioRuntime.ts`: microphone recording through `expo-audio`.
- `callVoiceActivityRuntime.ts`: deterministic voiced/silence transitions and
  end-of-utterance detection for ordinary hands-free calls.
- `nativeCallAudioRouteRuntime.ts`: earpiece/speaker routing and the playback
  session configuration that preserves the selected route.
- `nativeCameraRuntime.tsx`: camera-only permission gating and front/back native
  self-preview.
- `nativeAudioPlaybackRuntime.ts`: one-shot playback with deterministic release.
- `audioAiRuntime.ts`: remote STT/TTS with bounded requests and safe failures.
- `nativeSpeechRuntime.ts`: device speech fallback.
- `nativeCameraRuntime.tsx`: camera + microphone permission gate and connected
  self-camera preview.
- `nativeVideoRuntime.tsx`: `expo-video` persona playback.
- `localMediaRepository.ts`: durable media promotion and deletion.

## Permission Policy

- Voice message and voice call request microphone permission lazily.
- Video-call microphone and camera permissions are independent. Camera preview
  requests camera access only after the call is connected; muting never changes
  camera permission and camera denial never changes microphone state.
- Photo library uses the system picker; camera capture requests camera access at
  the user action.
- Permission/config-plugin changes require rebuilding the native client.

## Persistence Policy

- Selected images, microphone recordings, and generated TTS used by persisted
  messages live under `Paths.document/nana-media` on native.
- Cache URIs must never be written into durable relationship state.
- `clearAllData()` removes AsyncStorage, SecureStore secrets, and Nana media.
- Web keeps picker media for the current browser session only.

## Session Safety

- Chat generations carry `chatId + requestId`.
- Call speech work carries `callOverlay.startedAt` as the session token and an
  `inputEpoch` that is incremented on mute, background, end, and interruption.
- Every async state write and audio playback side effect validates the token.
- Call voice activity requires fresh voiced samples, trailing silence, and a
  measured recording duration before it can submit. Noise spikes and repeated
  recorder frames cannot create ghost transcripts.
- Directly-created audio players are paused and released on finish/replacement.

## Device Verification Matrix

Test on both Android and iOS development builds:

1. First permission allow.
2. First deny and retry.
3. Permanently denied/open-settings path.
4. App background/foreground during capture.
5. Android picker process/activity recreation.
6. App restart followed by old image/voice playback.
7. End a call while STT, LLM, or TTS is pending and confirm no stale playback.

Exact SDK reference: https://docs.expo.dev/versions/v55.0.0/.
