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
- The Kuromi neumorphic icon pack is now the sole home icon language. The
  retired Nana icon-pack option is no longer exposed or bundled by the home
  grid, and persisted legacy selections migrate forward automatically.
- The Android UI now shares one lavender/pink-gold neumorphic material system
  for raised rows, compact actions, and inset inputs across Chats, Settings,
  Wallet, World Book, Characters, and Theme.
- The shared Kuromi soft-neumorphic phone chrome is now the sole system
  material across the dynamic island, home weather widget, and bottom dock.
  The original crystal option is no longer exposed, and version-10 persisted
  state normalization moves existing installs to the supported material.
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
- Recording feedback now keeps one stable dynamic-island layout across send,
  cancel, and convert states. Copy crossfades in place, waveform bars animate by
  transform instead of relayout, and the gesture overlay and playback bubbles
  use the Kuromi neumorphic material instead of a separate voice visual system.
- The simulated-phone home remains mounted behind an open app. Closing an app
  immediately reveals the already-present launcher without an app-layer fade,
  so the previous page cannot flash over icons and widgets no longer appear to
  be recreated after every app transition.
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
- Every trace records its product origin. Current online events default to
  WeChat, while completed Meeting memories use the `offlineScene` source and
  `offlineMeeting` origin without exposing raw scene state to the shared brain.
- Remembered digested traces are injected into `buildAiContext` as the
  relationship timeline.
- `memoryWindowSize` now controls both unsummarized chat-memory records and
  relationship-trace recall instead of being persisted but ignored.
- Local raw-memory forwarding works without an API key.

### Offline Meeting Vertical Slice

- Meeting is a standalone simulated-phone app with its own scene list, manual
  creation flow, and chat-to-meeting handoff for one to four characters.
- Each scene owns an immutable preset snapshot, structured turns, status
  checkpoints, mini-theater blocks, edit/retry actions, and an explicit
  completed or abandoned lifecycle.
- Native scenes are durable in Expo SQLite. Web smoke tests use an isolated
  AsyncStorage repository behind the same protocol.
- Ending a scene opens a review step. Only the memory drafts selected by the
  user become idempotent `offlineScene` relationship traces; raw turns remain
  in the Meeting repository and are not injected directly into chat context.
- Local deterministic generation keeps the complete flow testable without an
  API key, while the model adapter remains behind the existing AI boundary.
- Meeting list, creation, handoff, scene, review, status, errors, and
  accessibility labels support both English and Simplified Chinese.
- Meeting now restores the latest act on entry, keeps current status fixed
  above the reading list, shows each character identity only once per turn,
  and generates a separate one-to-two-line poetic epigraph instead of
  promoting or removing the first narration paragraph.
- Android keyboard avoidance now covers Meeting creation, handoff, scene,
  review, and the other simulated-phone app editors while leaving the existing
  WeChat input behavior unchanged.

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

### Online Social And Multimodal Loop

- Moments now uses the shared sky and Kuromi neumorphic material without the
  redundant in-feed add button. User posts persist locally, support durable
  local photos, likes, comments, and replies, and no longer create relationship
  memory merely because every friend could see a post.
- Each character has an independent autonomous-Moments policy (`off`,
  `occasional`, or `normal`). Foreground scheduling has per-character and
  global cooldowns, consumes a real relationship event at most once, and
  generates from the character persona with a localized fallback when no model
  is configured.
- Stickers are durable first-class chat messages. A shared global library is
  available from WeChat Me; each relationship also has a private library from
  the character profile. Multi-select photo-library import supports animated
  GIF/APNG/WebP assets, while editable names and semantic tags let both the user
  and the character select stickers by meaning.
- User photo messages keep their original image bubble and can now continue
  through a bounded vision-capability request before the text model replies.
  Failed or unavailable vision falls back safely without blocking the chat;
  unanalysed or sensitive images are not promoted automatically into memory.
- Character profiles can hold a user-approved local image library. Autonomous
  image sharing is explicit opt-in and enforces character isolation, intent/tag
  matching, a six-hour cooldown, and a two-image daily cap.
- Text, vision, speech-to-text, and text-to-speech now have explicit capability
  boundaries and diagnostics. Settings can either reuse the chat provider or
  securely configure a separate OpenAI-compatible voice endpoint, which allows
  Gemini chat to coexist with remote character speech. STT and TTS models are
  independently selectable and time/response-size bounded.
- Mossland is recognized as an official voice-only provider. Nana uses its
  documented transcription and standard synthesis request shapes, stores a
  per-character `voice_id`, and never silently substitutes an OpenAI preset.
  Streaming synthesis remains reserved for the future live-call transport.
- Native Mossland and OpenAI-compatible multipart uploads use Expo SDK 55
  `File` objects with `expo/fetch`, allowing the runtime to generate the
  correct multipart boundary instead of passing an unsupported React Native
  URI object to the server. STT diagnostics now identify input,
  configuration, request, response, or decode failure while removing API keys
  from user-visible errors.
- Failed voice delivery retains the original local audio and transcript. Retry
  reuses the same message instead of recording a duplicate; transcript-only
  recovery can continue as text when the audio file is no longer available.
- A transcription failure no longer marks an already-recorded, playable voice
  bubble as a failed message. Leaving the failed convert-to-text state clears
  its retained capture, so returning to voice starts at hold-to-record instead
  of reopening the stale retry panel.
- Character editing exposes real remote voice presets, accepts compatible
  custom voice IDs, and provides an immediate preview. Character profiles also
  expose a one-tap preview. Unsupported official-provider voice IDs fail
  explicitly and use installed device speech instead of silently changing to a
  different remote voice.
- Voice bubbles share one native audio player across the recycled chat list;
  bubbles without a retained remote audio file remain playable through the
  installed device voice. Starting or ending a call stops message audio,
  releases synthesis playback, and aborts in-flight STT/model/TTS work. Muting
  or backgrounding performs the same cancellation, while call and preview TTS
  files are deleted immediately after playback instead of accumulating in the
  relationship-media directory.
- Voice reply permission now gates chat voice output. Calls remain the current
  turn-based capture -> transcription -> model -> speech loop, not full-duplex
  realtime audio or WebRTC.

### Reliability And Data Safety

- Adding a user-created character as a WeChat friend now creates its durable
  proactive schedule immediately, so enabled background relationship
  notifications and foreground heartbeat delivery include custom characters.

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
- Each character now has a separate short-term continuity state for current
  emotional tone, active topics, and unfinished questions, concerns, plans, or
  promises. It is bounded, time-expiring, normalized during version-9
  hydration, included in portable backups, and cleared with the chat without
  deleting long-term relationship evidence. Chat, proactive outreach, and
  model-backed calls share it.
- Remote replies can update continuity through a private structured envelope
  inside the existing generation request; the metadata is stripped before
  bubble rendering and malformed output falls back to deterministic local
  extraction. Simulator chat therefore exercises the same lifecycle without
  an API key or an extra model request.
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
- Proactive outreach now exposes four user-facing rhythms: off, occasional,
  normal, and frequent. Existing earlier schedules are preserved, interaction
  applies only the selected quiet boundary, and each character may optionally
  use an IANA time zone while the default follows the device.
- AI context contains an explicit current local date, weekday, time, time-zone
  name, and offset. Character-local time is included when configured, while the
  prompt forbids treating clock context as evidence that an event occurred.
- User name, avatar, and persona are saved atomically after confirmation and
  resolve through one social-identity boundary. Existing user-authored chat and
  Moments records are synchronized so WeChat Me and Moments no longer fall back
  to `User` or render a local file path as text.
- The Moments cover can be selected from the system photo library, survives
  Android picker recovery, and can be reset to the bundled default.
- User-authored Moments now enter a bounded character-reaction loop. At most
  two eligible friends react, one may leave a persona-aware comment, and a real
  comment becomes relationship evidence for that character. Blocked and
  removed relationships are rechecked before commit.
- Character sticker use is no longer limited to replying to another sticker.
  A normal generated reply may select a matching global or relationship
  sticker through deterministic semantic and frequency gates.
- Android picker recovery now covers Moment post photos and global or
  relationship sticker imports. The draft text, sticker scope, and relationship
  owner survive activity recreation; canceled, rejected, or orphaned promoted
  files are cleaned safely.
- Relationship notifications are now an explicit global opt-in in Settings.
  The native runtime schedules only the next eligible character reminder,
  preserves the existing global cooldown and resting-window rules, and cancels
  stale Nana reminders without touching unrelated notifications. Tapping a
  reminder opens the corresponding in-phone chat. Closed-app reminders are
  local only: they never fetch a push token or call the configured model API.
  Native and web implementations are split so browser smoke tests do not load
  the mobile notification module.
- Call STT/LLM/TTS work is isolated by call-session token and input epoch,
  including playback side effects. Muting, backgrounding, ending the call, or
  starting a new AI turn invalidates stale capture work.
- Each model turn in a connected call receives the most recent twelve ordered
  call transcript lines in addition to normal chat history. The current user
  utterance is deduplicated at the boundary, so longer calls retain their
  actual wording without double-injecting the newest speech segment.
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
  messages without animating through older history, so off-screen historical
  bubbles are not all mounted at once.
- App open/close visibility and chat bottom correction are now instantaneous.
  The old app tree is hidden before its short unmount grace period, the
  launcher stays mounted without opacity transitions, and long chats correct
  to the newest message with `animated: false`.
- Payment reactions now include persona, recent chat, and relationship context,
  and the character may accept or decline a transfer or red packet. A longer
  bounded provider window reduces false fallbacks; timeout or malformed output
  degrades to a short persona-sensitive accept/decline reply instead of an
  official system template. Settlement remains in the durable payment path.
- Opening a simulated app reuses the already-mounted sky instead of mounting a
  second full-screen scene. Home widgets and their looping weather animations
  unmount while an app is active, and the old full-screen opacity/translate
  transition no longer exposes the dark canvas between surfaces.
- Character reply-preference pills now have explicit intrinsic height and a
  non-flexing text layer. Enabling voice or video fields cannot collapse their
  labels during Android layout recalculation.
- The launcher remains mounted for app-transition continuity, but its content
  is hidden beneath active apps and its weather/sky timers and looping motion
  pause whenever an app is open or Nana is not foreground-active. App headers
  subscribe only to the current chat, and each bubble observes only its own
  selection state, reducing background work without remounting the desktop.

## Verification

- TypeScript: `tsc --noEmit`.
- ESLint: `npm run lint`.
- Contracts: `test:text`, `test:media`, `test:voice-gesture`,
  `test:call-audio-route`, `test:call-voice-activity`, `test:payment`,
  `test:storage`, `test:chat-storage`, `test:trace`, `test:memory-context`,
  `test:memory-correction`, `test:chat`, `test:chat-rhythm`,
  `test:message-delivery`, `test:conversation-continuity`, and
  `test:proactive-chat`, `test:proactive-notifications`, `test:moments`,
  `test:stickers`, `test:provider-capabilities`, `test:image-ai`,
  `test:character-media`, `test:voice-provider`, plus `test:theme`.
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
- The 2026-07-29 physical-device follow-up completed TypeScript, ESLint, text,
  payment, storage, chat-storage, theme, and localization checks. The Pixel 7
  UI path now also toggles both character media settings and asserts that all
  three reply-preference labels remain visible before continuing through chat,
  payment, avatar, and voice/video call coverage.
- The 2026-07-29 online-social pass completed TypeScript, ESLint, Moments,
  stickers, provider-capability, image-understanding, character-media, payment,
  media, storage, long-chat, continuity, proactive-chat, trace, and localization
  checks. The complete four-viewport UI path passes; a focused 390x844 path
  additionally opens Moments and the global sticker manager at
  `screenshots/smoke-social-final/report.json`.
- The 2026-07-29 voice-provider pass completed provider, media, call route,
  call activity, voice gesture, storage, long-chat, continuity, payment,
  Moments, sticker, vision, character-media, localization, TypeScript, and
  ESLint checks. A focused 390x844 UI path covers the separate voice service,
  character voice selection, and chat recording states at
  `screenshots/smoke-voice-provider/report.json`.
- The 2026-07-29 online completion pass added official Mossland STT/TTS,
  durable failed-voice retry, stable recording/playback motion, global user
  identity, a replaceable Moments cover, character time zones, four proactive
  rhythms, and persistent app-shell transitions. TypeScript, ESLint, Android
  export, localization, and the focused Pixel 7 voice/Moments/profile path pass;
  the focused UI report is
  `screenshots/voice-v17-check/report.json`.
- The 2026-07-30 physical-device repair pass corrected native multipart STT
  uploads, separated STT enrichment failure from voice-message delivery,
  recycled call recorders across sessions, cleared stale convert-to-text
  retries, removed app-shell and chat-history sweep animations, and polished
  the Kuromi voice gesture, model-list, and Moments-cover surfaces. TypeScript,
  ESLint, and 18 combined voice, call, delivery, performance, social identity,
  proactive-chat, theme, storage, and continuity contracts pass. Focused
  390x844 and 360x800 visual reports are in
  `screenshots/ui-voice-moments/report.json`,
  `screenshots/navigation-stability/report.json`, and
  `screenshots/navigation-long-chat-final/report.json`.
- The final online wrap-up added six-turn call transcript continuity, bounded
  character reactions to user Moments, semantic sticker replies for ordinary
  chat, Android recovery for Moment photos and sticker imports, and foreground
  animation/subscription throttling. Call, Moments, stickers, media, performance,
  delivery, theme, and glass contracts pass together with TypeScript, ESLint,
  a clean Android export, and the corrected Pixel 7 visual path at
  `screenshots/online-wrap-visual-fix/report.json`.
- The final pre-offline online integration pass completed every repository
  contract plus TypeScript, ESLint, localization, and Android export. Its full
  four-viewport UI path covers Settings voice service, character voice editing,
  Moments, sticker management, chat recording, payment states, profiles, and
  voice/video calls at `screenshots/smoke-online-final/report.json`.
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
- The closed-app relationship-notification foundation passes its dedicated
  permission, scheduling, cost-policy, deep-link, persistence, and web-boundary
  contract. Expo config resolves `expo-notifications` 55.0.25, all four UI
  smoke viewports pass, and a regenerated local Android debug APK contains
  `POST_NOTIFICATIONS`, boot recovery, and the Expo notification services.
- The outgoing-delivery pass adds deterministic transport/read planning,
  persisted lifecycle normalization, duplicate-safe turn retry, foreground
  recovery, and a dedicated `test:message-delivery` contract. The complete
  360x800 chat, voice, payment, avatar, and call smoke path passes at
  `screenshots/smoke-message-delivery/report.json`.
- The short-term continuity pass adds version-9 normalized state, bounded
  topic/open-loop lifetimes, same-request private model patches, local fallback,
  and shared chat/proactive/call context. Its dedicated
  `test:conversation-continuity` contract and the complete 360x800 UI path pass
  at `screenshots/smoke-conversation-continuity/report.json`.
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
- The 2026-08-11 OTA-safe Meeting repair completed TypeScript, ESLint, all 35
  repository contracts, localization, and the full four-viewport UI smoke
  baseline. A focused 320x568 English Meeting path additionally covers empty,
  create, opening, turn, edit, retry, long-scene, memory review, completed, and
  read-only states at
  `screenshots/smoke-meeting-i18n-2026-08-11/report.json`.
- The 2026-08-11 Android shell-stability pass gives the safe-area provider
  first-frame native metrics, reserves a fixed maximum dynamic-island lane,
  keeps Meeting controls below the physical cutout, and removes animated
  top-padding reflow from the shared app shell. Native compact breakpoints now
  use the physical screen height instead of the keyboard-resized window, while
  shared press feedback runs on the UI thread without React press-state
  rerenders. TypeScript, ESLint, motion, foreground-performance, and settings
  stability contracts pass. The complete 320x568 path covers Settings,
  Characters, Meeting and chat handoff, WeChat, Moments, stickers, payments,
  voice gestures, and voice/video calls at
  `screenshots/smoke-android-shell-stability-2026-08-11/report.json`.

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
media playback. Animated sticker playback, multi-select album import, remote
vision compatibility, autonomous character-photo limits, and persona payment
accept/decline also require the next physical-device/API pass. Voice validation
must additionally cover microphone allow/deny, the selected remote STT/TTS
provider, device-speech fallback, Bluetooth/wired route changes, ending a call
while recognition or synthesis is active, and a sustained voice-chat heat run.

Sounds and the standalone Photos app remain intentionally disabled until they
have a clear relationship job and write to the same trace system.

## Next Recommended Work

1. Prepare the next intentional Android test build only after this online
   wrap-up is committed, then verify Mossland STT/TTS with a real key and
   `voice_id`, multi-turn call continuity, failed-voice retry,
   recording/playback smoothness, Moment character reactions, Android picker
   restoration, global/relationship GIF stickers, global identity, Moments
   cover replacement, character photo sharing, user-photo understanding, and
   several persona-dependent transfer/red-packet accept and decline cases.
2. In the same long physical-device session, verify autonomous Moments timing,
   likes/comments, sustained chat continuity, notification allow/deny and tap
   routing, battery temperature, and app-to-chat transition smoothness.
3. Keep closed-app reminders local-only until a separate server-backed
   generation design has explicit cost, privacy, retry, and deduplication rules.
4. Run the current SQLite migration, high-volume chat, model-backed rhythm, and
   persona/event-driven proactive checks together on a physical Android device
   when the next test APK is intentionally prepared.
5. Continue the online memory vertical slice with canonical fact extraction
   and deterministic recall scoring after sustained real-model conversations
   provide test data.
6. Establish Apple signing/device access and run the same physical-device
   matrix on iOS.
7. Validate Meeting handoff and multi-turn generation with a real model during
   the next long physical-device session, including background/resume,
   completion review, relaunch persistence, and duplicate-safe trace writes.
