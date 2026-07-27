# Nana Design System

This is the durable visual and interaction contract for Nana. Read it before
changing the phone shell, any app surface, chat, calls, memory, or themes.

## Design Read

Nana is a native mobile relationship product for people returning in short,
private emotional moments. The language is restrained dream-sky realism:
familiar phone behavior, one living environment, and relationship actions that
remain clearer than decoration.

- Design variance: 5/10. Recognizable structure with selective asymmetry.
- Motion intensity: 4/10. Motion communicates state and continuity.
- Visual density: 5/10. Daily-use product density on small phones.

## Physical Scene

At 11 PM, in a dark bedroom, a user opens Nana with one hand. Within thirty
seconds they should be able to see that a character is still present, continue
the last conversation, answer a call, or revisit a shared memory. The interface
should feel quiet, private, and alive.

## Non-Negotiable Environment Rule

There is one selected environment.

- The default remains the time-aware system `SkyScene`.
- A selected built-in or custom wallpaper is applied through `SkyScene` and is
  inherited by home and every app interior.
- App interiors remove home icons, dock, widgets, and the development time
  scrubber, but they do not replace the environment with another background.
- A screen may add one semantic readability scrim or a content surface.
- A screen may not add a second wallpaper, baked cloud scene, per-app aura,
  decorative ellipse clouds, or an opaque gradient that hides the sky.
- WeChat draft art is a composition and material reference only. Its background
  is not a product asset.

## Product Principles

1. Relationship actions before ornament. Chat, call, remember, repair, and
   share must be the clearest actions.
2. The sky is an environment, not a decorative wallpaper.
3. Use one memorable signature per screen.
4. Keep standard phone behavior; put brand expression in material and moments.
5. Never show an ability that the product cannot complete.
6. Every meaningful relationship object should be able to return to memory.
7. Raster assets carry characters, photos, artwork, and content thumbnails.
   They never carry UI text, navigation, controls, or state.

## Semantic Tokens

Consolidate page-specific palettes into these roles:

- `environment.sky`: the single active environment resolved by `SkyScene`.
- `surface.scrim`: a light foreground contrast layer over the sky.
- `surface.base`: ordinary lists, bubbles, and grouped content.
- `surface.raised`: selected content, composer, sheets, and overlays.
- `surface.input`: a stable high-contrast form surface.
- `text.primary`, `text.secondary`, `text.tertiary`, `text.inverse`.
- `accent.relationship`: restrained peach-copper for primary relationship
  actions and selection.
- `accent.memory`: quiet blue for memory source and save feedback.
- `state.success`, `state.warning`, `state.danger`, `state.info`.
- `border.hairline`: low-contrast structure, not a border around every object.

Geometry:

- Control radius: 12-14.
- Content radius: 16-18.
- Important surface radius: 20.
- Full pills are reserved for compact tags and round controls.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32.
- Touch target: at least 44 by 44 points.

## Typography

- System UI or Inter for navigation, controls, labels, body, and settings.
- Playfair Display is reserved for a character name or one relationship-focus
  heading, never routine controls.
- Chinese uses the system CJK font to avoid mixed fallback jumps.
- Body: 15-16 with 21-24 line height.
- Metadata: at least 11-12.
- Durations and amounts use tabular numerals.
- Arbitrary custom text colors are not a supported theme feature.

## Core Components

- `SkyScaffold`: environment, safe areas, phase, and foreground contrast.
- `PhoneChrome`: status, island, system back, and minimize behavior.
- `ScreenHeader`: title, back, and one primary action.
- `Surface`: only scrim, base, raised, and input levels.
- `RelationshipHero`: character, real status, recent shared trace, and call.
- `ConversationRow` and `BottomNav`: live text and icons, never baked UI.
- `ChatBubble`: text, voice, photo, call, transfer, gift, and memory.
- `Composer` and `MediaActionSheet`.
- `PermissionState`: explanation, request, denial, and recovery.
- `CallStage`, `CallControls`, and `CaptionsPanel`.
- `MemoryTimeline`, `MemoryTraceRow`, and `MemoryDetail`.
- `Field`, `ToggleRow`, `Section`, and `DestructiveAction` for settings.

## WeChat Draft Reference

Keep:

- Relationship focus, then conversations, then bottom navigation.
- Character header, message objects, composer, then media actions.
- Voice waveform, shared-memory card, call record, time, and unread state.
- Deep sky surfaces with a low-saturation peach-copper accent.

Reduce:

- Borders only on selected or high-signal objects.
- Stable translucent solids instead of blur-heavy glass.
- Serif only for the relationship focus.
- Compact hero on small screens.
- One moon, avatar frame, or glow signature per screen.

Remove:

- The draft background and device frame.
- Baked text, navigation, composer, buttons, and transparent hit areas.
- Uncomputed relationship levels and percentages.
- Decoration on every card.
- Any incomplete action presented as if it works.

## Motion

- Ordinary state transition: 140-200 ms.
- Page or bottom sheet: 200-260 ms.
- Use ease-out-quart/quint or a critically damped spring, never bounce.
- Animate a new message, not the entire message history on every visit.
- Expand Dynamic Island only for calls, recording, memory save, payment, and
  recoverable errors.
- Reduced motion uses a crossfade or an immediate state change.
- Haptics: selection light, recording start medium, save success, destructive
  or call-end warning.

## Responsive Rules

Compact means width at most 360 or height below 700.

- Compact gutter: 12. Regular phone gutter: 16.
- Compact relationship hero: 88-108 high and horizontal.
- Header: 48-52 high.
- Media actions use a scrollable 2-by-N grid or horizontal pages. Labels never
  shrink into unreadability.
- Call screens keep two caption lines and three primary controls first.
- Use width, height, and font scale, not device names.
- Composer remains above keyboard and bottom inset.
- Voice, emoji, and plus panels are mutually exclusive.
- Android back closes panel, page, then app in that order.
- Development time controls never render in production.

## Native Capability States

Voice:

`explain -> request -> ready -> recording -> processing -> playable/retry`

Camera and video:

`preflight -> camera/microphone permission -> preview -> connected -> off`

Call:

`incoming/dialing -> ringing -> connecting -> connected -> ended/missed`

- Call duration starts only after connection.
- Mute, speaker, and camera controls must drive the runtime or be absent.
- Permission denial offers a safe fallback and a route to device settings.
- Camera stays off before the user accepts a video call.
- Voice and call transcripts remain readable, selectable, and memory-capable.

## Accessibility Gate

- Every icon control has an accessible name and state.
- `AnimatedPressable` forwards Pressable accessibility props.
- Selected states are not color-only.
- Dynamic Island and media outcomes expose live-region semantics.
- Text remains usable at 130 percent font scale.
- Stable surfaces over the sky meet WCAG AA contrast.
- No fixed-height localized text containers that clip Chinese or English.
- No invisible hit targets or UI labels baked into images.

## Implementation Order

1. One SkyScene and one semantic token vocabulary.
2. Accessible primitives and real navigation/actions.
3. WeChat relationship golden path and media actions.
4. Call state, permissions, summary, and memory trace.
5. Visible relationship memory timeline.
6. Character, user, provider, and theme settings.
7. New apps only after their data writes a `RelationshipTrace`.
