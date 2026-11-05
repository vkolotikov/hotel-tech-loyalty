# Staff Android 1.0.5 release — 5 November 2026

Owner request: use the supplied root `favicon.jpg` as the app icon, publish the new Android release and update Google Play's screen images. This is Staff only. No Laravel deployment or iOS release is part of this pass.

## Build and assets

- Source branch `feature/staff-play-release-20261105`; runtime `d8cec9e70`. Native mirror runtime `80e68de39`, pushed to `feature/loyalty-staff-app`. Runtime app files matched between both checkouts.
- The original 1181 × 1181 JPEG is copied unchanged to `assets/brand-icon-source.jpg`. Source and copy SHA-256: `6D962452FCF7A158AD73DC8554E098EE027FC6B0B19029EA58C114D59B5828B5`. Artwork was not regenerated, recoloured or redesigned. Derived PNG exports use the entire supplied image: 1024 app icon, 256 web favicon, 512 Play icon. Android's 1024 adaptive foreground has a 112-pixel inset to preserve the lockup under launcher masks, on the source corner colour `#06063c`. Existing login PNG and splash configuration stay independent.
- App version **1.0.5**, remote Android code **4**. Production EAS build `deda8509-5b6c-4bc5-8577-875cb36317e8` completed successfully at 2026-11-05 10:22:10 UTC. Build logs and JSON are private under `staff-design/play-105-*`.
- TypeScript and all **45 tests** pass; Expo dependency check is clean. Initial `npx eslint` selected ESLint 10, incompatible with the existing Expo React plugin; running the installed member-app ESLint with the existing Expo config passes. No source/dependency change was needed for that tooling mismatch.
- Five updated **1080 × 2160, 24-bit PNG** phone screenshots are in `store/screenshots/play-phone`: Home, manual member search, member card/actions, Requests and More. They are actual Android captures of the tested 1.0.4 layout, which is identical in 1.0.5 (only icon/config changed). Android demo mode removed unrelated status notifications; no app content was composited or edited. The first search capture had a floating input-method toolbar and was replaced by a clean capture before delivery. Display size, demo mode and transition animation were restored afterwards.
- `store/play/feature-1024x500.png` uses the exact supplied logo and concise app text. Five-language release notes are in `store/play/release-1.0.5.json`, each below Google's 500-character limit. Screenshots show only the isolated reviewer organisation/member; no customer data or credentials were used.

## Play and access checkpoint

Read-only Play API inspection after submission confirms production remains **1.0.0 / code 3**, while internal testing is now **1.0.5 / code 4**, status `completed`. All five listing texts still match the existing source. Production is publicly released from the earlier approved submission.

API edits uploaded the replacement icon, feature graphic and five screenshots and verified each returned SHA-256 and count. Standalone validation returned **403: The caller does not have permission**. A direct commit with `changesNotSentForReview=true` returned 400, saying review is automatic and this parameter must be omitted; a normal commit without the parameter also returned **403**. One transient 503 occurred before uploads and was retried. All uncommitted asset edits were deleted; **the images have not been changed in Play**. Do not claim the assets are staged or published. The existing service account was deliberately granted testing/app-quality access, not production or store-presence editing; no permissions were expanded.

The user's already-open browser and desktop could not be reached: both browser host and Computer Use native pipe are unavailable. Retried and reset both runtimes per their recovery instructions; no desktop input was possible. A separate Chrome DevTools browser opens, but remains on Google's sign-in form even after the owner reported sign-in. Do not read/copy browser profile credentials to work around this. The owner was asked to restart the desktop chat application and return, to restore its desktop connection. Continue independent EAS work while possible; finish Play listing replacement and production review submission once an authenticated controllable console is available.

## Completed bundle checks and internal delivery

- AAB: `C:\Users\user6399\Downloads\HexaTech-Staff-1.0.5-4.aab`; SHA-256 `BFAEC07BFA9F4FBCAE58FA5C29948A683CA00A4033F2078F17D96E6DAC8E01F8`.
- Google's official bundletool 1.18.3 verifies actual package `uk.hexatech.loyalty.staff`, version `1.0.5`, code `4`, camera/NFC permissions, and no microphone/Advertising ID permission. Packaged project id, Firebase mobile app id and sender id match the private Staff Firebase configuration. The compiled adaptive launcher foreground was extracted and visually checked against the supplied artwork. No runtime credentials were printed.
- EAS submission `c9b74e65-d3d6-4665-acb7-f69d68de4519` completed successfully to **internal testing**. The Play API independently confirms internal code 4. Existing [internal tester link](https://play.google.com/apps/internaltest/4700822212750987105).

Next: restore an authenticated controllable Play Console, promote code 4 to production with the five release notes, replace English base-listing images (other locales inherit them), review Publishing overview and send the update for review under the owner's explicit publishing request. No further publication permission question is needed. Never describe an internal upload or review submission as public approval/publication.
