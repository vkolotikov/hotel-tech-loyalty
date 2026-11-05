# Staff original logo and compact gold layout — 5 November 2026

The owner supplied `C:\wamp64\www\Hexa-Tech\hexatech_logo_fin.png` and requested the original artwork unchanged, compact on login, square Scan controls, consistent spacing and a brighter gold accent. The standing instruction remains: no logo or redundant staff/brand copy inside the signed-in app.

## Implementation

- The source PNG is copied byte-for-byte to `apps/loyalty-staff/assets/hexatech-logo-original.png`. It is 1254 × 1254 RGBA, with transparent outer padding. SHA-256 of both files: `47E82E9457F644A742B83AFB4974E37E07F35229ABA0F57959F34FB10018B11B`. No image editor, generation, recolouring or resampling was used. `BrandMark` displays the original in a 280 × 174 layout window: only transparent canvas is outside that window; the entire visible lockup remains present.
- The blue/gold wallpaper remains unchanged. Shared theme tokens now use champagne gold (`#f5d28a`, highlight `#ffe8b6`) and cool navy glass. Active controls have a brighter gold rim. Venue membership tier materials and semantic status colours remain independent.
- Operational headers use one compact row. Main page inset is 20 points, with a 12-point grid gap. Home has a square Scan action and square secondary tiles. Scan has a responsive square control, three labeled icon tiles, a compact desk/place/event selector and always-visible manual search.
- Typing switches to Number and stops camera/NFC capture. Changing modes dismisses the keyboard and resets the torch. Camera permissions/settings, iOS NFC activation, Android continuous NFC listening, duplicate-read suppression and durable scan recovery still use the existing implementations. Pending or unavailable recovery storage disables new scan controls.
- Requests and member tabs share equal-height icon tiles. Member actions and More use compact icon-first grids. Long content remains in readable horizontal list rows. Large text switches grouped controls to a vertical layout and permits scrolling. Guide now uses its book icon.
- No added dependency, background animation, backend change or store submission. Existing border-only motion and reduced-motion/solid-background preferences remain. Launcher and native splash assets retain their configuration.

Runtime source: `94076f18e` on `feature/staff-compact-gold-20261105` (initial layout `76a1846e6`). Native mirror: `f1c27d784`, pushed to `feature/loyalty-staff-app`. All tracked staff app files matched by SHA-256 after the final correction. Final preview version **1.0.4**.

## Verification

- TypeScript and changed-file ESLint pass. All 45 existing app tests pass, including translation parity and operation/scan recovery rules.
- Browser preview at 393 × 852 and 320 × 710: login, Home, Scan, Requests, member detail and More inspected. No horizontal overflow. Login inspected in English, German, Russian, French and Spanish. Original logo proportions and full visible artwork verified.
- Request state tabs, member Details/Activity tabs and Give points navigation work against synthetic browser fixtures. Request tiles at 393 points are approximately 109.7 × 109.6 points. No real loyalty data was changed by browser checks.
- Web cannot supply native SecureStore, so scan/write controls correctly remain blocked by the existing durable-storage guard in the web preview. Native scan acceptance is recorded below after installation; the browser is not evidence of hardware NFC or QR scanning.
- Private screenshots use `C:\Users\user6399\HexaTech-release-private\staff-design\compact-*`. Credentials remain outside git, chat and screenshots.
- Initial native 1.0.3 acceptance found Requests tabs collapsing in the non-scrolling list header. Android measured the nested flex-filled surface at only its border height; the web preview did not reproduce this. Version 1.0.4 removes flex fill from the segment surface so its intrinsic minimum height is preserved, and puts each icon/symbol in a shared minimum-height slot. This is the reason for the replacement build.
- The initial native build preserved the prior signed-in session. Camera permission denial/retry/grant, live camera preview, unsupported-NFC guidance and manual lookup of the isolated App Review Member all worked. Member detail displayed the matching member, actions and tabs. Native login shows the original logo correctly at font scales 1.0 and 2.0. No points, requests or card links were changed. Real NFC tags and optical QR recognition remain physical-device acceptance items.
- Native email Next and password Go sign-in passed using the isolated demo. Fast ADB text entry initially dropped email characters; the retry used a private per-character helper and verified the email and masked password length before submitting. This was an automation input issue, not a change to the sign-in code.
- Final 1.0.4 installed over the prior preview and retained the demo session. Home fits the screen. Requests Waiting/Approved/Done navigation passes; all three tiles have identical vertical bounds (342–636 physical pixels), with labels at 514–562. Scan QR/NFC/Number tiles likewise share bounds and label baselines. Camera preview, NFC-unavailable guidance and Number mode are working. At font scale 2.0, Requests controls stack and the demo request rows remain readable. Font scale and transition animation were restored to 1.0, and the app was left on Home.
- The original 2 GB emulator experienced input ANRs affecting Staff, Google services, Play Store and System UI during heavy guest load. A guest reboot was insufficient. The saved Pixel_8_API_35 device was cold-started with a 3 GB runtime memory override, preserving all user data/accounts. Subsequent final-build checks were responsive; the post-cold-boot system log contained zero ANRs and the inspected app log contained zero ReactNativeJS/AndroidRuntime errors. No app change was made to mask the emulator issue. A final UI Automator hierarchy capture could not reach idle after restoring animations; its screenshot showed the healthy Home screen.

## Android delivery

The initial diagnostic build **1.0.3 (3)**, `23d366c6-dced-4727-bc78-2d1b239bdef8`, completed at 08:35:26 UTC. It is superseded because of the native Requests sizing issue above.

Replacement EAS preview **1.0.4 (3)**, build `40f19c73-7b50-4bf2-8918-8fb7e0f4a092`, completed 2026-11-05 09:11:54 UTC from runtime `94076f18e`. Final native layout acceptance is complete and the APK is installed on `emulator-5554`.

- [Download the final Android APK](https://expo.dev/artifacts/eas/kA8XzgyhgxYMqfV4cgJq6UShl19lIyZmG0jy_I3PDRU.apk)
- Local APK: `C:\Users\user6399\Downloads\HexaTech-Staff-Compact-Gold-1.0.4.apk`
- SHA-256: `45D34224D61ACEBBFCC5736363D69C72F82929B037E7D79A985EC260A69E2398`
- The superseded 1.0.3 APK was moved out of Downloads into the private diagnostic folder to avoid accidental installation. Physical NFC tags and actual QR recognition still require a real-device check; no iOS artifact or store update was produced in this pass.

For future visual iteration, Expo documents [repacking an existing native artifact](https://docs.expo.dev/build-reference/repack/) with a new JS bundle when native compatibility is unchanged. That workflow was not configured or used in this pass; full EAS builds were used.
