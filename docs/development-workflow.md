# Development Workflow

## Preview OTA updates

The installed Preview APK follows the `preview` EAS Update channel. After the
first OTA-enabled Preview build is installed, JavaScript, TypeScript, styles,
and bundled asset changes can be published without rebuilding the APK:

```powershell
npm run update:preview -- --message "Describe the change"
```

Force-close and reopen the Preview app after publishing. A non-development
build downloads an available update in the background and applies it on the
next launch.

Create a new Preview APK instead when native compatibility changes, including
adding or removing native packages, changing Expo config plugins or Android
permissions, upgrading Expo/React Native, or changing native app assets. Bump
the app version before that build so the `appVersion` runtime policy creates a
new compatible OTA runtime.

This document records the working process for Nana. Read it before a new
implementation thread.

## Start Of Thread

1. Read `AGENTS.md`.
2. Read `docs/product-direction.md`.
3. Read `docs/architecture-memory.md`.
4. Read `docs/project-status.md`.
5. If the task touches native media, read `docs/media-runtime-design.md`.
6. If the task touches UI layout or screenshots, read `docs/ui-smoke-workflow.md`.

## Expo Rule

Before writing Expo or React Native code, read the exact versioned Expo SDK 55
docs:

```text
https://docs.expo.dev/versions/v55.0.0/
```

This is required because Expo APIs and native module guidance changed.

## Current Verification Commands

Use the project's scripts where possible:

```bash
npm run lint
npm run smoke:ui -- --no-start-server
```

For local Android Studio work:

```powershell
npm run android:generate
npm run android:build:debug
npm run android:studio
```

The generated `android/` project is ignored and may be regenerated. See
`docs/android-studio-workflow.md`.

On some Windows environments, the normal `node` command may fail while reading
the user profile. Project scripts call `scripts/run-node.ps1`, which discovers
the optional bundled Codex runtime from `%USERPROFILE%` and otherwise falls
back to the installed Node.js executable.

Type checking was previously verified with:

```powershell
& .\node_modules\.bin\tsc.cmd --noEmit
```

## UI Smoke Workflow

`scripts/smoke-ui.mjs` runs Playwright against Expo web and captures screenshots
under `screenshots/smoke/`.

Current covered viewports:

- iPhone 12: 390 x 844.
- Pixel 7: 412 x 915.
- Small Android: 360 x 800.
- Small iPhone: 320 x 568.

Current covered path:

- Home screen.
- WeChat app launch.
- Luna chat.
- Voice panel.
- Plus/action panel.
- Video-call overlay and connected speech state.
- Console errors.
- Page errors.
- Blank render checks.
- Horizontal overflow checks.

Add smoke steps when a feature becomes core, especially desktop theme editing,
call overlays, music app, shopping app, offline scenes, and memory timeline.

## Native Feature Workflow

Native capability work should be staged:

1. Define the normalized runtime contract and bounded web fallback.
2. Read the Expo SDK 55 docs for the exact module.
3. Add or update app config permissions.
4. Add the native module through Expo-compatible install commands.
5. Route all native calls through a service/runtime boundary.
6. Build a development or preview binary.
7. Test on a physical device.
8. Only then expand product surface area.

Do not assume Metro reload is enough after permission or native module changes.
Rebuild the binary.

## Optional Research Tools

Internet and social research tooling is a local development capability, not a
project dependency. Do not commit local tool paths, browser profiles,
credentials, or copied source content. Keep requests low-frequency and
summarize or paraphrase research results.

## Git And Dirty Worktree

The repository currently contains many uncommitted and untracked migration
changes. Do not revert unrelated changes. Before editing a file, check whether
it already has user or generated changes and work with them.

Recommended handoff command:

```bash
git status --short
```

Only stage or commit when explicitly asked.
