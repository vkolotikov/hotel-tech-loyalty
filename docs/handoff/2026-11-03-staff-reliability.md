# Staff reliability and Figma continuation — 3 November 2026

Owner: “lets proceed with your suggested improvements.” This follows the Staff audit, not a new member/admin redesign or store publication request. Implement confirmed reliability fixes now; present new design for review before applying it.

Worktree `C:\wamp64\www\hexatech-apps`, branch `feature/staff-reliability-20261103`, based on audit commit `36c3e594d`. Full scope, checks and remaining items: `docs/loyalty-staff-app/04-RELIABILITY-AND-DESIGN-20261103.md`.

Figma file `HQV6zF7ArPVd7rpdf1UUPr`, session `69cf3a38-3417-47ca-a671-eace288fcac3`. Board `4:186`, core group `4:190`, critical states `4:621`, prototype start `4:851`. Seven editable concepts, visually verified. Native code still uses the previous layout. Do not imply the Figma redesign or future feature controls are implemented.

Checks: TypeScript and 38 Vitest tests passed; Expo dependency check clean; Android/iOS/web bundles exported before the final navigation guard and Home capability gate. No store release or backend deployment in this pass.

Private demo authorizations and credentials remain as in `2026-11-03-native-apps-release.md`; never echo them. Physical iOS, biometric, NFC and push acceptance remain required for release.

## Source and preview

- Native source commits: `e5617cb2f` (main fixes/design records), `7d2b9e7c1` (restored attempt identity and prevent navigation during send), `24a119344` (Home analytics capability gate). Pushed to `feature/staff-reliability-20261103`.
- Standalone Staff source copied by explicit file list to `C:\wamp64\www\hexatech-staff-release-20261102`: commits `07075671a`, `9fde7fe62`, pushed to remote `feature/loyalty-staff-app`. Do not merge native feature history into `main`.
- Final Android preview: `e59809c6-5177-4a43-a443-11b29aded97a`, source `24a119344`, profile `preview`, production EAS environment (for Firebase file), internal APK. Version remains 1.0.0; this is not a store release.
- Earlier preview `75e529da-d360-47b2-9e52-e258540a8ba7` was cancelled; `3b6d1f77-4508-4fe5-be74-c38cbd7bbabe` contains `7d2b9e7c1` and is superseded by the final preview. Use only the final build for delivery.
- Owner requested a more luxurious, creative, Apple-like dark treatment with glass, less copy, icons and motion. **Finalize Home first, before other screens.** The earlier concept is not approved for implementation. The revised Home is described below.

## Android runtime acceptance

Pixel 8 API 35 emulator, isolated review organisation 49. Core preview `3b6d1f77-4508-4fe5-be74-c38cbd7bbabe` finished and installed successfully. Its source is `7d2b9e7c1`; the final source adds only the Home analytics capability gate. The Play-signed package could not be updated with the EAS upload-signed APK, so only the emulator's Staff package was uninstalled/reinstalled; no server account or other app was removed.

Observed in the installed core preview:

- Fresh Staff sign-in succeeds. Home, tab badge and Requests show 3 waiting items (2 rewards + 1 benefit), versus 1 in the published binary.
- Reward rows show full member number and code. Handover opens a confirmation containing member identity, reward and code. Cancel leaves the same queue intact.
- Done includes the completed reward alongside given/cancelled benefits.
- Member details/cards load. Entering `1.5` points is rejected; closing the form leaves the member at 210 points.
- Entering `-10` purchase amount is rejected with a positive-amount/currency-decimals message, without recording an amountless visit. Evidence: `docs/loyalty-staff-app/reliability-20261103/core-invalid-purchase.png`.
- Sign-out returns to an empty sign-in form. Android Back exits to Play rather than exposing previous member screens.
- No successful points, check-in or reward write was made during this pass. A small points-validation wording improvement is noted in the delivery report for the design phase.

Final preview `e59809c6-5177-4a43-a443-11b29aded97a` **finished successfully and installed** over the core preview at approximately 17:06 UTC. Package readback: `uk.hexatech.loyalty.staff`, version 1.0.0, code 3. APK SHA-256: `994CBFC7D9FF6BC27347931B7A95E236DC01901273BD1DBB2C2BF134795502B1`. Download: `https://expo.dev/artifacts/eas/_nUidiZnxgLbSEHcAop0OgQ72KQ-KjujPoaI1NK6iIo.apk`; local file `C:\Users\user6399\Downloads\HexaTech-Staff-reliability-preview.apk`.

Final-preview UI smoke check **passed after the owner restored the emulator** (approximately 18:11 UTC): fresh Staff sign-in, Home and Requests. Both Home and Requests show the current total 2, matching the visible 1 pending reward + 1 benefit request. The demo data changed between passes; do not confuse the earlier total 3 with the present queue. No successful reward, points or check-in write was made by this smoke check. Evidence: `reliability-20261103/final-home.png` and `final-requests.png`. The emulator was left on Home, signed into the isolated Staff demo.

Live demo API recheck after runtime tests: 25 reads passed, staff blocked from member portal. All 98 tracked Staff app files matched the standalone release tree by SHA-256. No physical biometric, NFC, QR or push-delivery acceptance is implied by these checks; non-manager analytics behavior was inspected in source, not exercised with a live restricted account.

## Home design refinement

Owner's requested scope is now **Home only**. Refined Figma page `12:674` / `Home / Obsidian glass` uses SF Pro for the iPhone UI, Cormorant Garamond for the venue wordmark, graphite surfaces, champagne metal, native iOS glass controls and an editable floating membership-card motif. Primary Scan, two compact actions and one activity row replace the text-heavy dashboard. Other design screens and native layouts were left unchanged.

- Review: `https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=13-723`.
- Motion study: `https://www.figma.com/proto/HQV6zF7ArPVd7rpdf1UUPr?node-id=18-1420&starting-point-node-id=18%3A1420`.
- Rest `13:723`; arrival `18:1420`; touch `18:1373`; notes `13:857`; component sources `13:682`.
- Arrival transitions into Home; tapping Scan shows brief touch feedback and returns. This is a Home material/motion study, not camera access, live transactions or a completed navigation prototype. Reactions were read back from Figma; actual prototype playback has not been independently observed.
- Final composition screenshot visually inspected; editable Home: 113 descendants, 29 text nodes, 13 instances, no image-filled nodes. SF Pro/Cormorant font families asserted; native glass button/tab components and Body/Regular text style verified. Small controls at least 44 high. Reduced motion/transparency behavior is specified for implementation; device/large-text acceptance remains future work.
- Evidence and material/motion decisions: `docs/loyalty-staff-app/05-HOME-DESIGN-20261103.md`, `design-20261103/home-obsidian-glass.png`.
- Asked owner to review this concrete Home direction. Await the reply before redesigning the remaining screens or implementing the new layouts.

## Reference-led Eclipse Home (latest design review)

The owner subsequently supplied a luminous black/gold/glass reference and asked for **Home only and element guidelines**, with animation later in code. Eclipse is the current proposal; preserve the earlier Quiet luxury and Obsidian pages.

- [Home](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=27-932) and [element guide](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=28-771).
- Page `23:674`; Home `27:932`; guide `28:771`; sources `27:798`. Same Figma file/session as above.
- Large luminous Scan control, four tiles (Members, Requests, Activity, More), four icon-only dock destinations, minimal copy. The owner liked the direction and then explicitly requested removing footer captions and refining the glass treatment. The Activity shortcut relocates existing permission-gated Home data in a future implementation; there is no existing separate native Activity route.
- Reusable Scan and tile states, native iOS profile/dock sources, colour/type/spacing/material guidelines, motion timing and reduced-motion/transparency requirements. Static Figma proposal; animations are intentionally deferred.
- Complete Home and guide screenshots passed visual review, including the icon-only footer revision. The footer now has matching 28 pt outline icons, a fine reflected rim and a champagne light pool beneath the selected icon; no visible labels or filled selection pill. Source `27:891`, guide specimen `35:845`. Four targets measure 82.25 × 64; retain accessible names and selected state in code. Home contains 112 editable descendants and no image-filled UI. Component properties, styles and token bindings verified; all 24 new variables have scopes/code syntax.
- Report: `docs/loyalty-staff-app/06-ECLIPSE-HOME-20261103.md`; evidence: `design-20261103/home-eclipse.png`, `home-eclipse-guidelines.png`.
- Await Home design feedback before applying layouts or designing the remaining screens. No app code, backend deployment or store submission in this pass.

## Eclipse extended to the other Staff pages (current)

The owner then said “ok, lets now make a designs for other pages.” This approves extending the Home direction in Figma; native layout implementation remains the next stage after design review. The prior Home-only restriction is superseded for design work.

- New page `40:674`, **Staff / Eclipse screens**, in the same file/session. [Main screens](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2938), [review index](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-3179), [navigation prototype](https://www.figma.com/proto/HQV6zF7ArPVd7rpdf1UUPr?node-id=43-867&starting-point-node-id=43%3A867). Original Home `27:932` and older concepts preserved.
- 44 editable screens/states in 11 sections: everyday, QR/NFC/manual scanning, access results, request queues and decisions, points/purchase/check-in, member details/cards, account/workspace, recovery, receipts and languages. Full inventory, functional mapping and prototype limits: `docs/loyalty-staff-app/07-ECLIPSE-SCREENS-20261103.md`.
- Keeps the luxury dark glass/champagne surfaces, sparse copy, editable vector icons and icon-only dock. Added reusable buttons, rows, fields, segments, four active dock states and switch styling at `42:674`; reuses the Eclipse foundations and Home motion/accessibility guide.
- All 11 section exports visually inspected. Corrected manual-scan context and card identifier/status overlap. Final audit: 44 frames at 393 × 852, SF Pro text, no image-filled UI, no visible text outside phones, 223 valid navigation actions, no wired target below 44 × 44. Full prototype playback has not been independently observed; the interaction data was read back.
- Prototype is illustrative: fixed sample data, representative member/request paths, no live inputs/search, sensor access, mutations, toggles or web destinations. Receipt navigation does not mutate the baseline balance/counts. Eligibility, permissions, balances, visit effects and request transitions remain server-authoritative in future implementation. Activity is a proposed separate screen for the existing permission-gated Home data; Check in/Purchase separate the existing visit flow in the UI.
- Selected gallery exports committed under `design-20261103/screens-01-everyday.png`, `screens-03-requests.png`, `screens-05-desk-actions.png`. Complete private design ledger: `C:\Users\user6399\HexaTech-release-private\staff-design\screens-final-state.json`; full section exports are beside it. No credentials are in design records.
- This continuation changes Figma and design documentation only. No app layout/animation, backend deploy, EAS build or store submission; no app tests rerun. Review the design before implementation, then retain the physical-device and accessibility acceptance work already noted above.
