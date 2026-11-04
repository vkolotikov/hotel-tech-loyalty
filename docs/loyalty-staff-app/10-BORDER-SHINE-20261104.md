# Staff Home — border light, 4 November 2026

Owner feedback: the previous animation was not good enough; shine should be confined to grid borders, and the background animation also needed improvement. This supersedes the broad mirror sweep in report 09. Scope remains the Android Home preview.

## Direction and implementation

The Home layout, system typography and short labels remain. The palette is Obsidian `#080B10`, Graphite `#17191F`, Warm white `#F6F2EA`, Champagne `#F3C582`, Pale gold `#FFF4D8` and Slate light `#6C85AD`. The large Scan action, two-column launcher and icon-only dock retain their existing hierarchy.

The previous diagonal reflection made the faces appear busy; tilting and illuminating them on press added another competing movement. Those effects are removed. A small champagne light now follows the rounded perimeter of each tile over ten seconds, with staggered positions. An opaque inner surface masks the light to a 1.1-point rim, keeping icons, text and the entire face still. One animation clock runs all five border lights using native transforms. The existing local glow asset supplies a feathered halo and pale core; no dependency or new image asset is needed.

The translating background arc is replaced with soft stationary side lighting. Its warm opacity changes from 0.12 to 0.20 and back over twenty seconds; the cool light stays fixed. There is no drifting geometry. Touch feedback is a restrained 0.99 scale; the dock's existing selection movement is retained. Reduced Motion, low power, app backgrounding and leaving Home stop the decorative loops; Reduced Transparency removes them.

Source `2d435e06c` on `feature/staff-border-shine-20261104`, based on `fd7a07c96`; mirror `017a6fb23` on `feature/loyalty-staff-app`. All 131 tracked Staff files match by SHA-256. No API, permission, business rule, translation or store submission changed.

## Verification

- TypeScript, all 38 Vitest tests, changed-file Expo ESLint and Expo dependency alignment pass. The lint run uses the installed member app's Expo configuration without introducing lint dependencies into Staff. Animated values use lazy state initializers, avoiding the React ref-access lint errors in the previous idiom.
- Browser visual checks at 393 × 852 and 320 × 740: no horizontal overflow; all six Home controls and four dock destinations remain. Members → Requests → Home navigation passed, with no new runtime errors.
- Pixel comparison 2.2 seconds apart: zero changed pixels in each of the five tile-face sample regions; changes appear along the sampled borders and in the ambient background. Reduced Motion screenshots 1.2 seconds apart are identical.
- Android preview build `3506601a-ea77-4eea-85b1-42193fe3be7d`, source `2d435e06c`, profile `preview`, version 1.0.0 (3), finished at 10:34 UTC. Installed successfully on Pixel 8 API 35 with the existing demo session preserved.
- Native screenshots three seconds apart differ under normal motion. Each of the five central tile-face sample regions has **zero changed pixels**. Reduced Motion screenshots are identical across the app area; the original Android transition scale of 1.0 was restored afterward.
- Native Home accessibility labels and selected state were read with Reduced Motion enabled: six Home controls, four dock destinations, Home selected, two live requests. UI Automator could not reach idle during continuous animation, so the hierarchy capture used the static state. Requests navigation and selected state passed under normal motion, then Home was reopened. A transient ADB offline connection recovered without clearing data. Final process-scoped logs contain zero fatal/JavaScript exception markers.

## Deliverable

[Download the Android preview](https://expo.dev/artifacts/eas/FK7VW44iINIxCo8wfnDEtGJnsCkZ0FMdH7lrs7zraWs.apk). Local APK: `C:\Users\user6399\Downloads\HexaTech-Staff-Border-Shine.apk`, 123,696,065 bytes. SHA-256: `CFBF6075A7E6631025A421ADE9BB32ED5A35A798F7C42743A2248740AEDBA683`.

Inspected device recording: `C:\Users\user6399\Downloads\HexaTech-Staff-Border-Shine.mp4`, 23.57 seconds at 540 × 1200, showing more than two border cycles and one background-light cycle. The emulator is left on Home with normal motion restored.

Unchanged device evidence: [Home](border-20261104/home.png), [border light](border-20261104/border-light.png), [Reduced Motion](border-20261104/reduced-motion.png).

The Figma file is unchanged; this is an implementation refinement of motion and materials. Physical-phone performance and the previously recorded slow emulator cold launch remain outside the visual acceptance evidence.

Runtime references checked before implementation: [Expo SDK 58 LinearGradient](https://docs.expo.dev/versions/v58.0.0/sdk/linear-gradient/) and [React Native Animated](https://reactnative.dev/docs/animated).
