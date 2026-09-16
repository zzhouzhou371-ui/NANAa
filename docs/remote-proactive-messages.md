# Remote Proactive Messages Boundary

This document defines the client/server boundary for character messages that
are generated while Nana is not running. The current shipped behavior remains
the existing local reminder unless an authenticated Nana backend is explicitly
configured.

## What The Client Now Owns

- A provider-neutral HTTPS registration client with cancellation, a bounded
  timeout, and retryable/non-retryable error classification.
- Expo push-token acquisition only after notification permission already
  exists. Android creates the relationship channel before requesting the token.
- A minimal registration body: installation ID, Expo push token, EAS project
  ID, platform, and app version. It never sends a model API key, prompt,
  character definition, or chat history.
- A strict remote message envelope containing only `eventId`, `characterId`,
  `text`, `generatedAt`, and `expiresAt` plus its kind/schema version.
- Persistent event-ID receipts and an in-flight lock. A received/tapped event
  is committed only after the caller's canonical foreground chat-write hook
  succeeds, so duplicate Expo delivery cannot create duplicate bubbles and a
  failed local write remains retryable.
- Native received, tapped, and cold-start response hooks. Web exports explicit
  no-ops and never imports `expo-notifications`.

## Remote Envelope

```json
{
  "schemaVersion": 1,
  "kind": "nana-remote-proactive",
  "eventId": "evt_opaque_id",
  "characterId": "character_opaque_id",
  "text": "Visible character message",
  "generatedAt": 1900000000000,
  "expiresAt": 1900003600000
}
```

Unknown fields fail closed. This prevents an accidental payload from carrying
model credentials or full history through the notification channel. Events are
bounded to a 48-hour lifetime and a 2,400-character visible message.

## Backend Work Still Required

The client boundary is not a server. A complete closed-app flow still needs an
authenticated Nana service that:

1. Issues a backend device credential kept in SecureStore and accepts token
   registration/rotation/revocation.
2. Stores the Expo push token and user-owned proactive-message permissions.
3. Generates proactive text with server-owned model credentials and a
   deliberately minimized, user-approved relationship context. The app's
   model API key must never be uploaded.
4. Applies per-character and global cooldowns, cost limits, expiry, and one
   stable `eventId` per logical message.
5. Sends through the Expo Push API with backoff for 429/5xx responses, checks
   receipts, and disables tokens reported as `DeviceNotRegistered`.
6. Treats push delivery as at-least-once and preserves the same event ID across
   retries. The client receipt is the final duplicate guard.

The root app must eventually connect
`observeRemoteProactiveNotifications` and
`consumeLastRemoteProactiveNotification` to one store action that validates the
relationship still exists, writes the character bubble, updates unread count
and schedule, and then resolves. Until that action and an authenticated backend
exist, registration should not be invoked.

## Build And OTA Boundary

Visible remote notifications and push-token APIs use the already-installed
`expo-notifications` native module. The service and validation code can ship as
an OTA update to a compatible existing build, but remote delivery still needs
valid Android/iOS push credentials and a development/preview build for device
testing (Android Expo Go does not support remote notifications).

This pass intentionally does not add `expo-task-manager`, enable iOS
`remote-notification`, or configure a headless data-only task. Writing a chat
message while the process is terminated would require those native changes and
a rebuilt binary. The current safe design commits the canonical bubble when a
notification is received by a running app or when the user opens/taps it.

References:

- [Expo SDK 55 Notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)
- [Sending notifications with Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
