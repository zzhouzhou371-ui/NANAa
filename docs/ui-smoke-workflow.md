# UI Smoke Workflow

Use this workflow before device testing and after layout-heavy changes.

## Command

```bash
npm run smoke:ui
```

The script starts Expo web on `http://localhost:8081/` when needed, runs a
Playwright smoke pass across common phone viewports, and writes screenshots plus
`report.json` under `screenshots/smoke/`.

To use an already-running server:

```bash
npm run smoke:ui -- --no-start-server
```

To inspect the browser while the script runs:

```bash
npm run smoke:ui -- --headed
```

## Current Coverage

- Home screen
- WeChat app launch
- Luna chat screen
- Console errors
- Page errors
- Horizontal overflow
- Blank or near-blank render checks

## When To Add More Steps

Add a smoke step whenever a feature becomes a core user path:

- Emoji panel
- Voice panel
- Plus menu
- Voice/video call overlays
- World Book details
- Preset editor
- Character editor
- Settings API configuration

Keep each step deterministic: navigate from a known state, capture a screenshot,
and assert one or two high-signal layout conditions.
