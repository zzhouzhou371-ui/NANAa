# Product Direction

This is the long-term product memory for Nana. Read it when opening a new
thread, planning features, or deciding whether a new idea belongs in the app.

## Product Thesis

Nana is a simulated-phone AI role-play app. The phone shell should feel like a
private device shared with AI characters, not like a generic chat app with extra
tabs.

The current first surface is a WeChat-like app for online/offline role-play,
character memory, world-book entries, presets, native-capable voice messages,
voice calls, video calls, moments, wallet-like interactions, and character
configuration.

The long-term product rule:

> Chat is the entry point, calls create intimacy, music carries emotion,
> shopping creates relationship objects, offline text adventure creates shared
> experience, and the memory system turns everything into a long-term
> relationship.

## Competitive Research Notes

Research on Xiaohongshu AI "small phone" projects showed that users respond to
three things:

- Realistic phone behavior: iOS-like sliding, dynamic-island style status,
  desktop editing, widgets, wallpapers, app icons, and native-feeling chat UI.
- Character life density: the character should have schedules, locations,
  social posts, photos, calls, messages, music, objects, and remembered events.
- User control without prompt fatigue: users want role depth and memory quality
  without constantly rewriting world books or model prompts.

Mooortal's "Pudding Phone" is the strongest public reference found so far. Do
not copy its feature volume directly, but learn the underlying system design:

- Model governance: character-specific risk reports, OOC patches, and per-role
  model/API choices.
- World editor: city maps, schedules, world rules, event pools, social orbit,
  and short/mid/long-term goals.
- Unified memory: a cross-domain timeline that lets chat, social posts,
  gallery, calls, and other apps feed one character brain.
- Social graph: posts, NPC activity, masks/identities, visibility, comments,
  and private-chat linkage.
- Evidence of life: generated or attached photos, galleries, stories, public
  and private albums, old objects, orders, logistics, and notifications.
- Relationship rituals: conflict repair, mediation, old-object exchange,
  anonymous/real-name interactions, gifts, and remembered relationship events.

## What Nana Should Not Do

- Do not chase a large app count before the core relationship loop is strong.
- Do not create isolated fake apps whose data never returns to memory.
- Do not make UI decoration that cannot be used, shared, or remembered.
- Do not hide all memory and model behavior in invisible services; users need
  understandable surfaces for repair, tuning, and trust.
- Do not wire native modules directly into feature components. Keep capability
  boundaries in services.

## Feature Lanes

### WeChat And Chat

This remains the primary entry point. It should own text chat, voice messages,
payment-like cards, red packets, stickers, images, location cards, music cards,
contact cards, voice calls, and video calls.

Important rule: chat UI elements should become relationship props. A transfer,
song, photo, call, location, or object should be able to enter memory and
affect later behavior.

### Offline Text Adventure

This is a future standalone app inside Nana's simulated phone, not a mode
switch inside the current WeChat chat. It should be a shared-scene experience,
not a full RPG first. Start with focused scenes:

- Walks, dates, room scenes, cooking, rainy-day shelter, and quiet recovery.
- Emotional repair scenes after conflict.
- Short event chains that produce memory summaries.

Large maps, combat, and complex progression can wait until the memory loop is
solid. The app owns its scene sessions and turns, while completed scenes write
relationship summaries into the same unified memory used by chat and calls.

### Music App

Music should express mood and relationship:

- Shared playlists.
- Character current listening state.
- Song cards sent into chat.
- Listen-together sessions.
- Relationship or anniversary playlists.

### Shopping App

Shopping should focus on relationship objects rather than catalog size:

- Gifts, wish lists, intimate payment, orders, logistics, and old objects.
- Objects should become visible in chat, room surfaces, moments, or memory.
- Each meaningful object should be able to carry a story.

### Voice And Video Calls

Pursue a high ceiling, but stage it:

1. Realistic call shell: incoming call, answer, hang up, timer, missed calls,
   call log, mute, speaker, and convincing visual states.
2. Real voice loop: TTS, STT, interruption handling, emotional voice profiles,
   and call summaries.
3. Video call persona: start with a convincing simulated video layer before
   attempting heavy real-time avatar rendering.

### Desktop And UI Personalization

The phone desktop should become screenshot-worthy:

- Wallpapers, app icons, widget slots, status bar, dock, notification capsule,
  and edit mode.
- Theme tokens before open-ended CSS-like customization.
- Strong performance boundaries for widgets and animations.

## Product Priority

The near-term product priority is:

1. Make the existing WeChat flow stable and beautiful on phone viewports.
2. Build visible memory and trace surfaces.
3. Keep native media/call affordances reliable behind service boundaries.
4. Add theme tokens and a better simulated-phone desktop.
5. Add one new app lane only when its data can feed the unified relationship
   memory.

## Design Taste

The visual direction should avoid generic AI-app styling. It should feel like a
personal phone that belongs to a relationship:

- Use system realism in important places: status, call screens, chat controls,
  notifications, sliding, and edit mode.
- Use one memorable signature per surface, not decorative clutter everywhere.
- Build for screenshots, repeated use, and small real-phone screens.
- Prefer stable layout, readable text, and strong interaction states over
  maximal decoration.
