# Architecture And Memory

This document records the current code architecture and the intended long-term
"unified brain" direction. Read it before changing store shape, AI context,
memory, native media, or new app surfaces.

## Current Code Shape

- Expo Router entry lives in `src/app/_layout.tsx`.
- The Expo Router home entry is `src/app/index.tsx`.
- The simulated phone home and app overlay live in
  `src/screens/home/index.tsx`.
- The main WeChat-like surface lives in `src/components/WeChatRootView.tsx`.
- Persisted and transient state lives in `src/stores/nanaStore.ts`.
- Shared product types live in `src/types/index.ts`.
- AI context and API calls live in `src/services/ai.ts`.
- Native media boundaries live in `src/services/`.
- Storage recovery helpers live in `src/services/storage.ts`.
- Relationship trace helpers live in
  `src/repositories/relationshipTraceRepository.ts`.

## Store Model

`useNanaStore` is the app's main state boundary. It uses Zustand with
AsyncStorage persistence.

Persisted state includes:

- User identity and API configuration.
- Characters.
- Friends.
- Chat history.
- Moments.
- Theme config.
- World-book entries.
- Online and offline presets.
- Memory settings and last forwarded message IDs.
- Unread counts.
- Call logs and relationship traces.

Transient state includes:

- Active app and WeChat navigation.
- Active chat/profile.
- Chat panel state.
- Dynamic-island notification.
- Character editor state.
- World-book editor state.
- Payment modal state.
- Call overlay state.
- Model loading state.

When adding durable product concepts, decide deliberately whether they belong in
persisted state or transient UI state. Relationship traces, memories, objects,
orders, playlists, and call summaries should usually be persisted.

## Current Memory Model

Memory currently uses `WorldBookEntry` with `group: "memory"` for each
character. A memory entry can contain:

- `content`: the summarized memory text injected into AI context.
- `records`: structured `MemoryRecord[]` exported from chat.
- `summaryState`: whether the summary is active or stale after a user
  correction.

`MemoryRecord` stores sender, text, time, message type, amount/note metadata,
summary state, remember flag, order, its source event identity, and an optional
suppression link to the verified trace that replaced it.

The current active AI context is built in `buildAiContext`:

1. Scene mode from the active preset.
2. Main prompt.
3. Jailbreak / NSFW prompt.
4. Character definition.
5. User persona.
6. Author's note.
7. Matched world-book lore.
8. Memory summary from the active character memory entry.
9. Unsummarized remembered chat records.
10. Recalled `RelationshipTrace` events, presented chronologically as a
    relationship timeline. The persisted `memoryWindowSize` controls both raw
    record and relationship-trace recall windows, with safe bounds.

Summarized records become visually complete and stop being injected as raw
records. Unsummarized remembered records plus the summary form the active
context.

## Implemented Unified Brain Foundation

The memory system is no longer chat-only. Chat, voice, photos, payments, calls,
and moments produce normalized, revisioned `RelationshipTrace` records. Traces
are visible in World Book, can be remembered or ignored, and are injected into
AI context as a relationship timeline.

Future trace sources may include:

- Chat messages.
- Voice message transcripts.
- Voice/video call summaries.
- Offline text-adventure scenes.
- Music listening sessions and song cards.
- Shopping orders, gifts, wish-list changes, and old-object stories.
- Gallery items and photo stories.
- Moments/friend-circle posts and comments.
- Notifications and proactive events.
- Relationship repair events.

The important product rule: new apps should not create separate brains. They
should write to one character memory timeline or trace system.

## Relationship Trace Shape

The current V1 shape is implemented in `src/types/index.ts`:

```ts
type RelationshipTraceSource =
  | 'chat'
  | 'voiceMessage'
  | 'voiceCall'
  | 'videoCall'
  | 'photo'
  | 'payment'
  | 'moment'
  | 'offlineScene';

interface RelationshipTraceOrigin {
  app: 'wechat' | 'offlineMeeting';
  mode: 'online' | 'offline';
  sessionId?: string;
  presetId?: string;
}

interface RelationshipTrace {
  schemaVersion: 1;
  id: string;
  characterId: string;
  source: RelationshipTraceSource;
  sourceEventId: string;
  origin: RelationshipTraceOrigin;
  title: string;
  summary: string;
  occurredAt: number;
  createdAt: number;
  participantIds: string[];
  tone?: string;
  mediaUris?: string[];
  remember: boolean;
  recallWeight: number;
  state: 'pending' | 'digested' | 'ignored' | 'failed';
  revision: number;
  userVerified?: boolean;
}
```

Future music, shopping, and offline-scene sources must extend this same timeline
and preserve source-event idempotency.

Persisted traces are normalized field-by-field during hydration. Legacy traces
receive safe defaults, malformed entries are discarded, and duplicate source
identities collapse to the preferred revision. User corrections revise the
same trace identity, preserve its original source and timestamps, and become
user-verified digested memories instead of creating competing entries.

A user-verified trace is an authority barrier: later automatic retries,
payment reconciliation, or stale AI work cannot overwrite it. If a correction
conflicts with a character memory entry, the old summary is retained for audit
but marked stale, and the raw record with the same source identity is
suppressed. AI context excludes stale and suppressed evidence, reserves recall
budget for verified traces first, and injects them once in an explicit
authoritative section.

The future offline-meeting app will own raw scene sessions, turns, choices, and
checkpoints. `RelationshipTrace` stores only recallable relationship outcomes;
it is not the scene save file.

## AI Service Boundary

`src/services/ai.ts` should remain the boundary for:

- Model list fetching.
- Gemini text generation.
- OpenAI-compatible chat completions.
- AI context building.
- Memory summarization.
- Memory consolidation.

UI components should not assemble large prompts directly. They should pass
structured state to service functions.

Future AI extensions should be separated by intent:

- Reply generation.
- Memory summarization and consolidation.
- Character behavior repair/OOC patch generation.
- Event generation.
- World or schedule generation.
- Object/photo/story generation.

## Media Runtime Boundary

`src/services/mediaRuntime.ts` and the adjacent native runtime services are the
current media boundary. Voice, camera, video persona, and image picking are
native-capable; web retains a bounded fallback for smoke testing.

Current native mappings:

- Voice input and playback: `expo-audio`.
- Camera capture: `expo-camera`.
- Video persona playback: `expo-video`.
- Photo-library and system-camera selection: `expo-image-picker`.
- Durable media promotion: `expo-file-system`.
- API-secret storage: `expo-secure-store`.

Do not import native audio, camera, or video modules directly into chat
components. Add native capability behind this service or a closely related
runtime service, then return normalized states/results to the store.

Theme wallpaper picking follows the same native boundary:

- `src/services/theme.ts` owns the built-in wallpaper and icon-pack registries.
- `src/services/nativeImagePickerRuntime.ts` owns the `theme-wallpaper` picker
  intent, Android activity recovery, and durable promotion into
  `nana-media/images`.
- `ThemeConfig.wallpaperId` selects the system, built-in, or custom environment;
  `backgroundImage` stores only the durable custom URI.
- `SkyScene` is the sole renderer for the selected environment, so home and app
  interiors cannot drift onto different wallpapers.
- `ThemeConfig.iconStyle` selects a registered home icon pack; unknown or
  migrated values safely fall back to the current system icons.

## UI State And Dynamic Island

The dynamic island is used for high-signal transient feedback such as typing,
processing, success, error, memory, and payment states. It should eventually
become part of the phone realism layer, connected to notifications, calls, and
proactive character events.

Avoid making it a generic toast dump. Use it for events that feel native to the
phone shell.

## Phone Chrome And Weather Runtime

`ThemeConfig.chromeStyle` selects one shared phone-chrome material. The system
style keeps the original crystal island and dock; `neumorphic-v1` applies the
shared lavender / pink-gold material to the dynamic island, home weather
control, separate time widget, and dock. These components must switch together so the phone shell
cannot drift into mixed materials.

`src/services/weatherRuntime.ts` is the boundary for local weather:

- The home widget starts with a time-aware simulated condition and never opens
  a permission prompt on launch.
- A tap explains the feature before Android or iOS requests foreground
  approximate location.
- Last-known location is preferred, current location and network calls have
  bounded timeouts, and cached or simulated weather keeps the widget usable
  when location or network data is unavailable.
- Open-Meteo receives coordinates only for the active request. Nana persists
  the normalized weather snapshot, never the device coordinates.
- Animated weather glyphs respect the operating-system reduced-motion setting.

## New Feature Checklist

Before adding a new app or major feature:

1. Define the relationship job it performs.
2. Decide what persisted data it creates.
3. Decide what memory or trace it writes.
4. Decide how the character can proactively use it.
5. Decide what UI state is transient only.
6. Keep native capabilities behind a service boundary.
7. Add smoke-test coverage once it becomes a core path.
