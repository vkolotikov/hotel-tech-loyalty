# Eclipse Home — Android preview, 4 November 2026

The owner approved implementing the Staff Figma design and suggested Home first while the other pages receive further design review. This pass implements Home, its four-icon dock and the existing activity destination. It does not implement the other Figma page layouts or publish a store release.

## Delivered behavior

- Home uses the Eclipse dark glass/champagne treatment, a large Scan member control, Members/Requests/Activity/More tiles, and account access. Organisation and request counts come from the signed-in workspace.
- The floating dock contains Home, Scan, Members and Requests icons only. Each retains its accessible name and selected state. More remains available from Home and the profile control, including all existing workspace/preferences/sign-out actions.
- Requests combines waiting benefits and pending rewards using the existing queue query. Zero hides the badge; loading is shown as loading; failures show an unknown/error state and Retry, never a confirmed zero.
- Existing figures and activity have moved to `/activity`. Both the Home shortcut and destination respect `staff.can.view_insights`; the restricted destination sends no analytics requests. Loyalty rules and mutations remain on the server.
- Decorative horizon drift stops off-screen, in the background, in battery-saving mode or with Reduced Motion. Scan has a short arrival reflection and controls have restrained press feedback. Reduced Motion retains static lighting; the iOS Reduced Transparency preference selects solid Home surfaces. The dock selection light is static in this first preview.
- All new strings are translated into English, Russian, German, French and Spanish. Layouts can grow and scroll with longer labels and larger system text.

## Design and assets

[Figma Home](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=43-867), file `HQV6zF7ArPVd7rpdf1UUPr`, implementation session `4a35fb3e-6cc2-43ad-a845-767f2c685ba8`. Existing Figma screens were read, not edited. The earlier Home and all other proposals remain intact.

`theme.ts` contains the Eclipse colour, type, gradient and spacing tokens. Android uses its system typeface and real system bars rather than the iPhone canvas's SF Pro and mock status bar. The iOS-only Code Connect glass controls have no existing native implementation in this repository; gradients, exact icon assets and a native-compatible profile icon reproduce their intended appearance on Android.

Fifteen Figma SVG exports are retained in `assets/eclipse/`, alongside faithful 3× PNG renders produced from their unmodified paths/filters. The runtime uses the PNGs so Android does not depend on unsupported SVG filter effects. Text and controls remain native, not flattened screen images. Logical dimensions:

| Assets | Dimensions |
| --- | --- |
| Scan | 60 × 60 |
| Members, Requests, Activity, More | 30 × 30 |
| Four dock icons | 28 × 28 |
| Atmosphere | 393 × 852 |
| Cool rim / gold rim | 181 × 62 / 234 × 78 |
| Dock pool / bloom / edge | 114 × 96 / 64 × 30 / 36 × 6 |

Home uses 24-point insets, 16-point tile gaps, a 186-point Scan control, 106-point minimum tiles and a 64-point dock. The material is rendered with local gradients and pre-rendered light assets; there is no real-time background blur requirement. All source assets are local; no expiring Figma URL is shipped.

## Verification

- TypeScript passed; all 38 Vitest tests passed; Expo SDK dependency check passed. SDK 58 patch packages were aligned, and `expo-battery` was added for power-aware motion.
- Production Android and iOS JavaScript exports passed, including all fifteen Eclipse runtime assets. An iOS export is a bundle check, not an installed iPhone test.
- Browser smoke checks with isolated fixtures: all Home destinations, profile access and dock navigation; loading counts, zero with no badge, 150 displayed as `99+` while spoken as 150, request failure and Retry recovery; permission-denied Activity with zero analytics calls; 393- and 320-point widths; all five locales using the real language selector.
- At 320 points the dock has four approximately 64 × 62-point targets. Russian wraps the greeting and the lower content scrolls clear of the dock. No browser runtime error remained after guarding the web-only unsupported battery event subscription. Expected HTTP 503 messages were produced by the injected request-failure scenario.
- Live isolated demo API check: 25 reads passed; Staff is refused access to the member portal. No points, reward, benefit or check-in mutation was made for this Home implementation.
- Installed Android acceptance passed on Pixel 8 API 35: update preserved the demo session; Home and Requests both show 2 waiting (one reward and one benefit); Members shows the existing 210-point member; Scan opens its camera/manual-entry screen; profile opens More; Activity displays live figures/feed and closes back to Home. No write/approval buttons were exercised.
- Android UI hierarchy confirms all ten Home/dock controls have destination names and the active Home tab is selected. The 200% system font setting keeps Home readable. With Android's transition animation scale set to zero, two screenshots three seconds apart were byte-identical, confirming decoration stopped. Font scale and animation settings were restored afterward.
- Cold startup remains slow on this emulator: the new preview's system draw records were around 16–21 seconds, and the previous verified reliability APK measured 19.55 seconds in the same environment. The new APK measured 15.28 seconds after reinstalling it for the final comparison. This does not establish physical-phone performance or a new Home regression; profile cold startup on a phone before release. Final runtime error log had no fatal/JavaScript exception markers.
- Physical NFC/QR, biometric and notification-delivery acceptance from the prior release runbook remains separate from this Home preview. The Scan navigation check is not a camera/NFC sensor test.

## Source and build

Main worktree branch `feature/staff-eclipse-home-20261104`, source `2a0ba1180`; standalone Staff mirror `68964cee9` on remote `feature/loyalty-staff-app`. All 46 changed app files were copied by explicit source list and hash checked. No native branch was merged into Laravel `main`.

Android preview build `d2afd1c2-989e-4e1a-a13a-fb2e6d591d02`, source `2a0ba1180`, profile `preview`, production EAS environment, internal APK. Version stays 1.0.0 (3) because this is a design preview, not a new store version. The build was submitted from the dependency-equipped main app worktree after the standalone mirror could not resolve its absent local Expo dependencies.

Build **finished successfully** at 08:41 UTC on 4 November 2026 and was installed with `adb install -r`. [Download Android APK](https://expo.dev/artifacts/eas/KO9XocOTLRuWj9xNzRWeTZTWLodNUv00duzUYbPDWx4.apk). Local copy: `C:\Users\user6399\Downloads\HexaTech-Staff-Eclipse-Home.apk`, 123,690,141 bytes, SHA-256 `70B72FF064F6DDC7F3016696EA358AB2ABEBF8C63107B0797F8AA22A0A84C576`.

Installed evidence: [Home](eclipse-android-20261104/home.png), [200% text](eclipse-android-20261104/large-text.png), [Requests](eclipse-android-20261104/requests.png), [Activity](eclipse-android-20261104/activity.png). The emulator is left on the new Home with its original settings. This is a design preview, not a Google Play or Apple submission.
