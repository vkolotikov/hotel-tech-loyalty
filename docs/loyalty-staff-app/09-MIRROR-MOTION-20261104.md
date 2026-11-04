# Staff Home — polished glass and motion, 4 November 2026

Owner: “lets add some animated effect, make bit more luxury and maybe mirror efect on grids … want more premium fealing.” This refines the installed Android Home preview from report 08. The existing Home hierarchy and brief copy remain the basis.

## Material direction

Polished smoked glass with a silver reflection and champagne underside. Palette remains Obsidian `#080B10`, Graphite `#17191F`, Warm white `#F6F2EA`, Champagne `#F3C582`, Silver `#DCEBFF` and Cool rim `#C7D8EF`. Platform system type and the approved Scan/two-column grid/icon-only dock arrangement are retained.

The main visual change is the reflection across the glass panes: a soft diagonal facet at rest, plus a moving light that crosses Scan and the grid in sequence. The first visual pass had an overly sharp facet and a visible rectangle edge on Scan; the final treatment extends past the clipping boundary and feathers the highlight to keep text and icons clear. Reflections are local gradients; no imagery or UI text is flattened into screenshots.

- One 14-second native animation clock coordinates all five moving reflections. Each pass travels for about 5.3 seconds, with small offsets across the grid and a quiet interval before the next cycle.
- Touch settles a tile to 0.98 scale with a restrained 1.4°/−1.2° tilt and a brief reflected highlight: 130 ms in, 240 ms out. Decorative layers cannot intercept input or appear in the accessibility tree.
- The dock's champagne selection light travels to the selected icon over 320 ms. The icons and tap targets stay fixed. More has no selected dock item, as before.
- A soft Scan shadow, reflected top edges and a restrained dock shadow add depth. The reflection tokens and timings live in `theme.ts`.
- Ambient motion stops when Home is hidden, the app is backgrounded, battery-saving mode is on, or Reduced Motion is enabled. Reduced Motion also removes the tilt/scale/glint and makes dock changes immediate. Reduced Transparency uses solid Home/dock fills. No sensors are needed.

## Checks and source

TypeScript, all 38 Vitest tests and Expo dependency alignment passed. Browser checks at 393 and 320 points confirmed the visual rest/sweep/pressed states, working Members/Requests/Home navigation, settled dock highlight alignment and four approximately 64-point-wide targets at 320 points. With Reduced Motion enabled, screenshots taken 1.2 seconds apart were identical and holding a tile retained unit scale and zero tilt. No new browser runtime errors were reported.

Main source `2c3551c77` on `feature/staff-mirror-motion-20261104`, based on `766a40410`; standalone mirror `f05b17a3e`, pushed to `feature/loyalty-staff-app`. Four native source files changed. No dependency, API, loyalty rule or store submission changed. Figma was not edited in this material/motion implementation pass.

Android preview build `e2111990-15dc-43b6-99b4-26341a88e926`, source `2c3551c77`, profile `preview`, version 1.0.0 (3), finished at 09:44 UTC. Installed successfully on Pixel 8 API 35 with the isolated demo session preserved. The live Requests count is 2. No store version increment or publication was made.

- Normal-motion screenshots three seconds apart have different app pixels; with Android `transition_animation_scale=0`, the same comparison is identical. The original setting was restored to 1.0. Font scale remains 1.0 and animator duration scale remains absent.
- Native Home/Requests navigation, the settled dock light, accessible control names and selected-tab state passed. Home was left open. The final process-scoped Android/JavaScript error log was empty.
- The actual device recording was inspected: 17.6 seconds at 540 × 1200, showing Home through a complete reflection cycle. Local video: `C:\Users\user6399\Downloads\HexaTech-Staff-Glass-Motion.mp4`. It demonstrates ambient motion; touch and dock movement were checked separately.
- Native evidence: [Home](mirror-20261104/home.png), [moving reflection](mirror-20261104/reflection.png), [Requests dock](mirror-20261104/requests-dock.png). Physical-phone performance remains unverified; the existing emulator cold-start limitation is recorded in the handoff.

[Download the Android preview](https://expo.dev/artifacts/eas/HieNTSZWtqkMzrak4WPb1hg0srVFie8uVZUbMbQ3p9E.apk). Local APK: `C:\Users\user6399\Downloads\HexaTech-Staff-Mirror-Home.apk` (123,695,669 bytes). SHA-256: `50122E349E67D8286034616455E0BFCFFB856B76D9B81995F00968AA1FB408AB`.
