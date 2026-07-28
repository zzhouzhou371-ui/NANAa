# Project Status

This is the current handoff point for Nana on Expo SDK 55.

## Product Direction

Nana is a simulated-phone AI relationship product. Chat is the entry point;
voice and video calls deepen intimacy; photos, payments, moments, and future
apps create shared relationship objects; one relationship timeline turns those
events into long-term memory.

The visual direction is one restrained dreamy-sky environment. The system
default remains the time-aware `SkyScene`; a selected built-in or custom
wallpaper is inherited by home and every app surface through that same
renderer. App interiors may add only a lightweight readability scrim.
Reference mockups are composition/material references, not backgrounds or
baked interaction layers.

## Current Framework

- Expo SDK 55, React Native 0.83, React 19.2.
- Expo Router root in `src/app/_layout.tsx`.
- Zustand state in `src/stores/nanaStore.ts`.
- Native media boundaries in `src/services/`.
- EAS development and preview profiles in `eas.json`.

## Completed

### Unified Product UI

- Home, WeChat, World Book, Presets, Settings, Character, User, Theme, and call
  surfaces share the same selected sky environment.
- Theme now offers the current time-aware system wallpaper, three bundled
  original sky wallpapers, and durable photo-library selection. Android picker
  recovery preserves the theme intent and all choices fall back safely to the
  system sky when an image cannot be loaded.
- The current home icons remain the default. A bundled nine-icon Nana
  neumorphic pack can be selected independently and unknown or migrated styles
  fall back to the system icon pack.
- The Android UI now shares one lavender/pink-gold neumorphic material system
  for raised rows, compact actions, and inset inputs across Chats, Settings,
  Wallet, World Book, Characters, and Theme.
- Theme now switches the phone chrome independently between the original
  crystal material and one shared soft-neumorphic material. The selected
  material applies together to the dynamic island, home weather widget, and
  bottom dock, and persists through the version-4 store migration.
- The old home character portrait widget is replaced by a phone-like raised
  time/date widget beside a separate frameless weather control. It starts safely with time-aware simulated weather,
  explains foreground approximate-location use before asking, uses bounded
  location/network requests, and falls back to cached or simulated data.
  Clear, cloud, fog, drizzle, rain, snow, and thunder glyphs include restrained
  reduced-motion-aware animation.
- WeChat draft-specific full-screen artwork and opaque app gradients were
  removed. Chat bubbles, menus, navigation, and call surfaces are real UI.
- Chats now use a relationship-first hero, data-backed activity labels, durable
  media objects, and a complete three-by-three relationship-action grid.
- Luna, Kai, and Aria ship with original bundled portraits. Custom avatar URLs
  and files still take precedence over those default-only assets.
- Voice calls use the familiar three-control skeleton: microphone, end call,
  and speaker. Video calls use a full portrait or video-persona stage, a
  26-30%-width self-preview, a three-control primary row, and a separate end /
  camera-flip row. Call screens never expose hold-to-talk copy.
- Native speaker state changes only after the audio route succeeds. Camera
  preview, camera on/off, and front/back facing are real native states; the
  deterministic web previews exist only behind the smoke-test flag.
- Voice messages use a WeChat-style hold-to-record gesture with live metering,
  release-to-send, slide-to-cancel, and slide-to-convert states. The 1000 ms /
  60 s duration boundaries and -64 / -40 point cancel hysteresis are contract
  tested.
- Home and WeChat have compact layouts for 320x568-class screens.
- Core controls expose roles, labels, state, and 44-point-class touch targets.

### Relationship Loop

- Text, recorded voice, photos, transfers, red packets, voice calls, video
  calls, and moments produce normalized `RelationshipTrace` records.
- Trace writes are idempotent by source event, revisioned, persisted, visible in
  World Book, and individually rememberable/ignorable.
- Legacy and imported traces are normalized field-by-field, invalid entries are
  discarded, and duplicate identities keep the preferred revision.
- The trace domain supports idempotent user correction while preserving the
  original event identity and timestamps. Corrected traces are marked as user
  verified and remain one canonical memory.
- Correcting a relationship memory is an atomic three-layer operation: the
  canonical trace is revised, conflicting raw evidence is suppressed, and the
  character summary is marked stale without deleting its audit content.
- User-verified traces cannot be overwritten by later automatic event replay.
  During import normalization they also win over higher-revision ordinary
  duplicates.
- AI context excludes stale summaries and suppressed records, gives verified
  memories first claim on the configured recall window, and injects each
  trusted correction exactly once.
- In-flight memory summarization and consolidation use an invalidation guard,
  so a result started before a correction cannot restore stale facts.
- Every trace records its product origin. Current events default to online
  WeChat; `offlineScene` and an offline-meeting origin are reserved for the
  future standalone Nana app without implementing its scene state yet.
- Remembered digested traces are injected into `buildAiContext` as the
  relationship timeline.
- `memoryWindowSize` now controls both unsummarized chat-memory records and
  relationship-trace recall instead of being persisted but ignored.
- Local raw-memory forwarding works without an API key.

### Native Media Runtime

- `expo-image-picker` provides system photo-library and camera selection.
- `expo-audio` records and plays voice messages, drives call voice-activity
  capture, and preserves the selected call audio route during AI playback;
  remote STT/TTS and device speech fallback are normalized as
  `MediaCaptureResult`.
- `expo-camera` provides connected-call camera preview. Camera permission is
  requested independently from microphone permission, and front preview is
  mirrored while back preview is not.
- `expo-video` renders configured character video-persona assets.
- Durable relationship media is promoted to `Paths.document/nana-media`; clear
  data removes the media directory as well as local state.
- Android image-picker activity recovery remembers and restores the target chat.

### Reliability And Data Safety

- Chat AI work is isolated by immutable chat ID and request token. Stale replies
  cannot write into a different chat, and retry reuses the original message.
- Chat replies now pass through a deterministic rhythm runtime. Character
  presence and message length produce a bounded delivery window, so responses
  no longer appear unnaturally instant. An empty API key uses a localized local
  sandbox reply through the same request and persistence path, allowing Android
  emulator testing without sending conversations to a model provider. Stored
  character messages record their generation source for later diagnostics.
- Online text now behaves as conversational bursts. Several user messages sent
  within the short collection window become one ordered model turn. Character
  output can produce one to three independent bubbles, delivered sequentially
  with request-token cancellation preserved through the final bubble. Voice
  remains one coherent message.
- New outgoing messages now persist a monotonic sending, sent, delivered, read,
  or failed state in their existing SQLite payload. Consecutive bubbles share
  one turn and the character waits for the full reading window before reply
  generation. A failed turn retries the same message IDs, preserving order
  without duplicate bubbles; restart recovery may restore delivery but never
  fabricates a read.
- Online characters now have durable proactive-message schedules. First launch
  only initializes a future due time; chat activity postpones it, successful
  outreach enters a longer per-character cooldown, and a global cooldown stops
  multiple characters from messaging together. Startup, foreground return,
  and long foreground sessions check one eligible friend while respecting
  blocked users, resting presence, calls, and in-flight replies. Proactive
  bubbles use normal durable history and unread behavior but do not become
  relationship memory until the user creates a real response event.
- Each online character profile now exposes a native proactive-message switch.
  Legacy and built-in characters default to enabled; disabling takes effect
  immediately, and re-enabling schedules a future window instead of sending
  immediately. With an API key, proactive text is generated from the
  character definition, online preset, recent chat, world-book context, and
  the newest unused real relationship event. Without a key or after a provider
  failure, the local adapter uses persona-sensitive localized copy. Event trace
  IDs are consumed once so outreach cannot cycle backward through old events.
- Call STT/LLM/TTS work is isolated by call-session token and input epoch,
  including playback side effects. Muting, backgrounding, ending the call, or
  starting a new AI turn invalidates stale capture work.
- API keys use SecureStore on native and session memory on web. AsyncStorage
  migration removes legacy plaintext only after safe migration.
- Export/import is redacted, schema/size/field validated, version checked, and
  rollback protected. Clear data restores the full initial store.
- Native chat history now uses a WAL-enabled Expo SQLite message repository
  instead of being rewritten inside the Zustand AsyncStorage JSON on every
  update. Existing installs migrate their legacy history once, web smoke tests
  retain an isolated compatibility repository, and portable export/import
  still carries the complete conversation history with database-aware rollback.
- The chat surface now uses FlashList recycling and starts from the newest
  messages, so off-screen historical bubbles are not all mounted at once.
  Existing bubble, payment, voice, retry, selection, and memory behavior remains
  unchanged.

## Verification

- TypeScript: `tsc --noEmit`.
- ESLint: `npm run lint`.
- Contracts: `test:text`, `test:media`, `test:voice-gesture`,
  `test:call-audio-route`, `test:call-voice-activity`, `test:payment`,
  `test:storage`, `test:chat-storage`, `test:trace`, `test:memory-context`,
  `test:memory-correction`, `test:chat`, `test:chat-rhythm`,
  `test:message-delivery`, and `test:proactive-chat`.
- UI smoke: four viewports (390x844, 412x915, 360x800, 320x568), seven core
  screens per viewport, screenshots plus console/page-error and overflow checks.
  The pre-UI-polish regression baseline generated on 2026-07-16 is in
  `screenshots/pre-ui-baseline-2026-07-16/`.
- The 2026-07-26 neumorphic/theme pass was verified on the Android emulator
  across Chats, Settings, World Book, Characters, Wallet, Theme, the system
  home, three bundled wallpapers, and both icon packs. The Android system photo
  picker opens for custom wallpapers and returns safely on cancel; recent
  logcat contains no JavaScript runtime or fatal Android errors.
- The post-theme 360x800 smoke path passes home, Discover neumorphic material,
  chat/voice gestures, payment states, custom avatar, and voice/video call
  states. Its current report is `screenshots/smoke-final/report.json`.
- The 2026-07-28 long-term chat storage pass completed TypeScript, ESLint,
  storage/chat/memory/media/payment/call contracts, and the full four-viewport
  UI smoke path after the SQLite and FlashList migration. A deterministic
  2,000-message small-Android stress path also reached the newest message while
  mounting fewer than 200 bubble nodes, confirming list recycling.
- The 2026-07-28 online-chat rhythm pass completed TypeScript, ESLint, text,
  storage, chat-storage, chat-request, and chat-rhythm contracts. The local
  simulator path is deterministic under the fast-chat test flag and remote
  generation remains selected whenever a non-blank API key is present. The
  subsequent bidirectional-burst pass also completed the full 360x800 chat,
  voice, payment, avatar, and call UI smoke path at
  `screenshots/smoke-chat-bursts/report.json`.
- The subsequent proactive-chat pass added a dedicated scheduler contract for
  initialization, migration, interaction and send cooldowns, global
  anti-burst limiting, eligibility, localized copy, lifecycle checks, unread
  delivery, and the rule that unanswered outreach writes no memory trace. The
  full 360x800 chat, voice, payment, avatar, and call UI smoke path passes at
  `screenshots/smoke-proactive-chat/report.json`.
- The persona/event and per-character control extension passes the same
  360x800 path at `screenshots/smoke-proactive-profile/report.json`; the online
  profile switch remains readable without displacing the existing reply and
  video capability rows.
- The outgoing-delivery pass adds deterministic transport/read planning,
  persisted lifecycle normalization, duplicate-safe turn retry, foreground
  recovery, and a dedicated `test:message-delivery` contract. The complete
  360x800 chat, voice, payment, avatar, and call smoke path passes at
  `screenshots/smoke-message-delivery/report.json`.
- The 2026-07-27 phone-chrome/weather pass was rebuilt into the Android
  development client and verified in the emulator for both chrome themes,
  weather permission explanation, Android foreground-location permission,
  no-GPS timeout fallback, weather text fitting, collapsed/expanded dynamic
  island states, and status-bar fade coordination. The full 360x800 web smoke
  path passes at `screenshots/smoke-weather-chrome/report.json`.
- Expo SDK 55 dependencies are aligned with the current compatible patch set,
  and the lock file passes the same strict `npm ci --include=dev` condition used
  by EAS Build.
- Android development client versionCode 13 completed successfully on
  2026-07-16 (EAS build `7d9a768d-7d6d-4989-8cc4-be1dc9dc3303`).
- Local Android CNG generation and 64-bit debug APK compilation completed
  successfully on 2026-07-26 with SDK 36, NDK 27.1.12297006, and Gradle 9.
  The local APK is generated under
  `android/app/build/outputs/apk/debug/app-debug.apk`.

## Repository Cleanup

- `src/app/index.tsx` is now a route-only entry; the simulated-phone home
  implementation lives in `src/screens/home/index.tsx`.
- `npm run clean:generated` removes local Android build caches, old smoke
  output, temporary web exports, logs, and Python caches while preserving the
  selected 2026-07-16 UI baseline.
- Runtime assets remain in `assets/backgrounds`, `assets/generated`, and
  `assets/images`. Large Blender/model sources and local visual-review output
  are excluded from Git and EAS bundles.
- Local Android Studio generation, compilation, and opening are documented in
  `docs/android-studio-workflow.md`.
- Expo prebuild currently reports that React Native 0.83.10 is recommended
  while the project remains on 0.83.6. The current local build succeeds; handle
  this as a deliberate SDK patch-alignment task rather than mixing it into UI
  work.

## Release Constraint

Web, static checks, and a successful cloud build cannot prove native permission
behavior. The Android development client must still be installed on physical
hardware, and an iOS development client must still be built and installed, to
verify first allow, deny, permanently deny, background return, process restart,
SecureStore, microphone recording, camera preview, picker recovery, and durable
media playback.

Sounds and the standalone Photos app remain intentionally disabled until they
have a clear relationship job and write to the same trace system.

## Next Recommended Work

1. Add physical-device system notifications for due proactive events while the
   app is closed, preserving the current durable cooldown and eligibility rules.
2. Add an explicit user-facing network/cost policy for model-generated
   proactive messages before enabling closed-app background generation.
3. Run the current SQLite migration, high-volume chat, model-backed rhythm, and
   persona/event-driven proactive checks together on a physical Android device
   when the next test APK is intentionally prepared.
4. Continue the online memory vertical slice with canonical fact extraction
   and deterministic recall scoring after sustained real-model conversations
   provide test data.
5. Establish Apple signing/device access and run the same physical-device
   matrix on iOS.
6. Build offline meeting later as a standalone simulated-phone app with its own
   sessions and checkpoints, writing only completed relationship outcomes into
   `RelationshipTrace`.
