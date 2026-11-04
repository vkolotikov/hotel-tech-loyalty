# Staff Home — supplied wallpaper and dock rim, 4 November 2026

Owner approved the border animation and requested it on the footer, with a restored luxury background using the attached image if it would not slow the app. Scope: Home wallpaper and the existing shared footer; other page layouts remain under design review.

## Material and motion

Used the owner's exact `Midnight Glasslight Arcs.png` from Downloads, copied without visual modification to `apps/loyalty-staff/assets/eclipse/wallpaper.png`. It is 863 × 1822, 1,529,054 bytes. Source and bundled hashes match: `19DCFF518155405311E7BC7C9F8F2B5192DE01C676426C1CCA3A792D0F534F91`.

The image's charcoal, blue-black and champagne curves restore the approved visual direction without adding content. It is one bundled static image, with cover scaling and a restrained theme-token scrim to protect the system-type labels. No image download, video, blur filter or background animation is used. The previous two ambient images and opacity loop are removed. Approximate decoded RGBA pixel storage is 6.29 MB before renderer overhead; this is an asset estimate, not measured app memory.

The footer reuses the exact rounded-border light component from the tiles: one ten-second native clock, two small reused glow images, clipped to a 1.1-point rim. Its opaque inner surface keeps the moving rim outside the controls. The selected-icon glow and icon-only navigation remain. Reduced Motion/low power/app backgrounding stop decorative motion, and Reduced Transparency hides the wallpaper and border lights.

Source `e19745c4e` on `feature/staff-wallpaper-dock-20261104`, based on `dcb820a3d`; standalone mirror `5ac2a4aa7` on `feature/loyalty-staff-app`. All 132 tracked Staff files match by SHA-256. No dependency, server endpoint, loyalty rule, permission, copy or store submission changed. Figma is unchanged.

## Checks

- TypeScript, changed-file Expo ESLint and all 38 Vitest tests pass. Native APIs checked against [React Native Image](https://reactnative.dev/docs/image) and [StyleSheet](https://reactnative.dev/docs/stylesheet).
- Browser visual checks at 393 × 852 and 320 × 740: wallpaper visible, readable controls, no horizontal overflow, four dock targets approximately 64 points wide at 320. Requests → Home navigation passed.
- Normal-motion captures show the moving footer rim; the sampled wallpaper pixels stay identical. Settled Reduced Motion frames are pixel-identical. The first capture set included viewport/animation-state settling; the final set used a fixed viewport and settled preference state. Test fixtures were reattached after the browser context reset. Their unguarded localStorage initialization produced an error only when leaving the app for `about:blank`; it is not app code.
- Before the new build, a 12-second emulator graphics sample from the previous border-only APK rendered 642 frames, 58 classified janky (9.03%); frame-time percentiles 50/90/95/99: 26/44/57/101 ms. This is an emulator baseline, not a physical-device performance guarantee.

Android preview build `04411346-121b-4a48-a5a9-b92cec3376a9`, source `e19745c4e`, profile `preview`, version 1.0.0 (3), finished at 11:27 UTC and installed successfully on Pixel 8 API 35. The isolated demo session was preserved.

## Installed acceptance and performance limits

The supplied wallpaper is visible, labels remain readable, and the footer highlight follows its rim. Native pixel comparison three seconds apart: zero changed pixels in the sampled wallpaper and dock-face regions, 1,329 changed pixels in the dock rectangle containing the rim. Reduced Motion frames are identical across the app area; the original transition scale of 1.0 was restored. Native hierarchy confirms all six Home controls, four footer destinations, selected Home and two live requests. Requests → Home navigation and selected state passed. Hierarchy captures use Reduced Motion because continuous decoration prevents UI Automator reaching idle.

Graphics samples use `dumpsys gfxinfo`, reset before each interval, with Metro stopped. The first new sample was slower, so it was repeated and the previous APK was temporarily reinstalled as a control. The new APK was then restored, its navigation/recording checked, and a final idle sample taken. These measurements must not be reduced to a claim of guaranteed phone performance.

| Sample | Interval | Frames | Janky frames | p50 / p90 / p95 / p99 (ms) |
|---|---:|---:|---:|---|
| Previous APK, original baseline | 12 s | 642 | 58 (9.03%) | 26 / 44 / 57 / 101 |
| New APK, first sample | 12 s | 517 | 79 (15.28%) | 27 / 81 / 109 / 200 |
| New APK, settled repeat | 12 s | 691 | 30 (4.34%) | 23 / 32 / 38 / 89 |
| Previous APK, reinstalled control | 12 s | 615 | 67 (10.89%) | 28 / 48 / 73 / 121 |
| New APK, immediately after recording | 12 s | 406 | 110 (27.09%) | 27 / 133 / 150 / 300 |
| New APK, idle after a 20-second wait | 20 s | 1,144 | 43 (3.76%) | 24 / 32 / 42 / 85 |

The settled new samples do not show a sustained rendering regression against the old APK. Other samples vary considerably, particularly the one after recording; the cause is not established by this test. Physical-phone performance and cold-start performance remain unverified. The emulator's previously recorded slow cold launch remains a separate limitation.

Final process-scoped logs contain zero fatal/JavaScript exception markers. The new wallpaper APK is installed and left on Home with normal motion restored. No loyalty transaction, store submission, backend deployment or credentials change was performed.

## Deliverable

[Download Android preview](https://expo.dev/artifacts/eas/kbeGHlPgj1FzWZBVDzBeIMVrkyug1-4bd5YmHWjLkqc.apk). Local APK: `C:\Users\user6399\Downloads\HexaTech-Staff-Wallpaper-Dock.apk`, 124,857,261 bytes. SHA-256: `18CC73C8189D649F57747D836F4472140E19A098E8A97C67BF1FA4FB55490FB1`. Increase over the previous border preview: 1,161,196 bytes (about 0.94%).

Inspected recording: `C:\Users\user6399\Downloads\HexaTech-Staff-Wallpaper-Dock.mp4`, 21.31 seconds at 540 × 1200, covering two border cycles. Unchanged native screenshots: [Home](wallpaper-20261104/home.png), [border lights](wallpaper-20261104/border-lights.png).
