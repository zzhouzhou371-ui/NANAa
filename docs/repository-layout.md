# Repository Layout

This is the working map for Nana. It describes the existing project rather than
imposing a broad migration.

## Runtime Code

- `src/app/`: Expo Router entries only. Route files should stay small.
- `src/screens/`: large route-owned screen implementations.
- `src/components/`: reusable and feature UI already shared across the phone.
- `src/components/system/`: simulated-phone shell primitives.
- `src/stores/`: persisted and transient Zustand state.
- `src/services/`: AI, storage, network, and native-capability boundaries.
- `src/repositories/`: durable domain-record helpers such as relationship
  traces.
- `src/constants/`, `src/types/`, `src/hooks/`, `src/utils/`: shared support
  code.

## Product And Engineering Memory

- `docs/product-direction.md`: long-term product rule and feature priorities.
- `docs/architecture-memory.md`: state, AI context, trace, and media boundaries.
- `docs/project-status.md`: current handoff and release constraints.
- `docs/development-workflow.md`: required verification workflow.
- `docs/android-studio-workflow.md`: local Android generation and testing.

## Assets

- `assets/backgrounds/`, `assets/generated/`, `assets/images/`: runtime assets
  referenced by the app.
- `assets/3d/`: large local Blender and model sources. These are intentionally
  excluded from Git and EAS bundles.
- `assets/references/`, `design/`, `artifacts/`: local design references and
  visual-review output, not runtime input.

## Generated Output

The following paths are rebuildable and ignored:

- `android/`, `ios/`
- `dist/`, `dist-test/`, `web-export-*/`
- `screenshots/` except that the selected baseline is preserved locally
- Android Gradle build and C++ caches
- root logs and temporary visual-review PNG files

Run `npm run clean:generated` to remove these outputs while preserving
`screenshots/pre-ui-baseline-2026-07-16`.
