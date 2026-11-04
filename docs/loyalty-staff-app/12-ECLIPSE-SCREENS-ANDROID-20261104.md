# Eclipse Staff screens — Android implementation

The owner approved extending the implemented Home style to the rest of Staff, using the existing Figma feature plan. This is an internal Android preview, not a store submission or Laravel deployment.

## Design and scope

[Figma screen index](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-3179), page `40:674`; implementation session `46a478b4-1a43-4904-bfe3-0d824b76aa9b`. Design-context code and screenshots were read for Members, Member, Activity, QR/NFC/manual scan, access result, Requests, reward handover, benefit detail, points, purchase, check-in, cards/linking, More, Profile, sign-in and receipt components. The Figma artwork is not used as flattened UI. Its editable layouts are translated into native, flexible-height controls.

Shared palette: charcoal `#080b10`, smoked glass `#17191f`, warm white `#f6f2ea`, secondary `#aab1be`, champagne `#f3c582`, semantic green `#a2cdb3` and red `#efa9a2`. System typography matches the approved Home; Android does not bundle Apple's SF Pro. Body 16/23, heading 38/44, labels 13/18. Content is left aligned with 24-point gutters. Operational rows are quiet; the approved travelling border light remains on Home controls and the icon-only dock. No animated background or face sweep is reintroduced.

The supplied static wallpaper now continues through the operational screens. Static Figma Lucide SVGs are preserved locally with 3× PNG renders for Android; 29 new vector/image pairs. The scanner uses its dedicated 174-point thin gold frame, not a scaled-up Home icon. Existing Home/dock artwork is reused. Figma's SwiftUI-only Code Connect snippets are not components in this Expo Android project; the already-approved native Eclipse surfaces are reused instead.

| Workflow | Implementation |
| --- | --- |
| Members | Search, server tier filters, pagination/refresh, compact glass rows and complete member identity |
| Member | Membership card; Give/Use points; separate Purchase/Check-in entry; Benefits/Activity/Details tabs; progress, history, contact details and cards remain available |
| Scan | Explicit QR/NFC/Number modes; only the selected sensor listens; location selection pauses scanning; typed lookup uses the same selected place/event context |
| Scan result | Server verdict and reason, member, benefits, desk actions, next scan and member profile; missing transient scan state has a recovery action |
| Requests | Compact paginated rows; separate detail, full identity/code, approve/decline/give/hand-over, member-visible decline reason, confirmed receipts and error recovery |
| Desk forms | Large numeric input, strict whole-point wording, neutral invalid-draft action label, reachable keyboard-aware footer, original durable retry journal |
| Purchase vs visit | One server endpoint and one persisted check-in attempt scope. A purchase requires a valid amount and desk-earn rights; a visit requires check-in rights. Restoring an unanswered operation restores its original mode/payload |
| Cards | Full identifiers, active/inactive states and existing NFC linking; no invented card disabling or replacement endpoint |
| More | Existing capability-gated web management links, with external-link icons |
| Profile | Separate account destination, language picker, full-row accessible switches, biometric lock, request alerts, sign-out and version |
| Sign-in/lock/outcomes | Same glass tokens, minimal copy, accessible password visibility control, static success receipt, existing session/biometric/update logic |

The design's fictional balances, tier names, location and dates are not copied into runtime behaviour. Permissions and every loyalty outcome remain server-authoritative. No backend endpoints, monetary rules, customer data or store listings are changed. Advanced enrolment/editing, card disable/replace, transaction correction and the other backend-dependent ideas from the product review remain outside this screen-implementation pass, as in the approved Figma scope.

## Verification before Android compilation

- TypeScript passed; 40 tests passed in four files, including the two new purchase/visit availability and amount requirements tests. Existing durable attempt, session isolation, queue pagination/counts and strict amount tests remain green.
- Changed-file Expo ESLint passed; Expo SDK dependency alignment passed; no new runtime dependency.
- Browser preview inspected at 393×852 and 320×720. No horizontal overflow on Members, member details, Requests, Scan, More, Profile or purchase. All new copy exists in English, Russian, German, French and Spanish (usted).
- Synthetic API UI checks: member Benefits/Activity/Details → cards/link-card; QR/NFC/Number switching and manual member lookup; benefit approve → Approved → given; reward code shown before handover; Profile language change and sign-out/password visibility. A failed request read displayed the refresh error, never a false empty queue. The synthetic routes intercept API traffic; these are not live transactions.
- Decline cannot be submitted with an empty reason; a supplied reason is sent unchanged and remains visible in the completed request. A manual member selection at a selected place sends that place's id, the member's number and a retry key, then displays the server's access verdict. With all staff capabilities false, member desk actions and permission-gated management links disappear; existing read-only Program, Rewards, Events and Guide destinations remain.
- Web SecureStore is unavailable for the durable desk journal: the preview correctly prevents points/purchase writes and displays its storage error. Native desk-form validation and keyboard acceptance must be checked in the Android binary. Browser checks are not native sensor, biometric or push-delivery acceptance.

## First Android acceptance and large-text adjustment

Initial preview `3be4f72d-ffa5-463b-85cc-a7c2b2b9a2f4` (source `b02f7405e`) finished at 12:48 UTC and installed over the existing Pixel 8 API 35 preview, preserving the isolated organisation 49 session. It loads one demo member, balance 210 and two waiting requests. Native member navigation, history/details, Cards and the NFC-unavailable linking state passed. Points `1.5` are refused; a blank purchase and GBP `1.234` are refused; the separate visit form has no purchase amount. No loyalty transaction was submitted.

Requests show complete member identity and redemption code before handover. Decline is disabled without a reason. These native inspections leave both requests pending; transition writes were checked against the browser's synthetic API.

At 200% system font size, the member identity, list, form fields, Profile and language picker remain readable and scrollable; the points footer remains reachable as the reason field scrolls into view. The member action row exposed an awkward split of “Purchase”. Member actions now stack vertically at font scale 1.4+, or above 1.1 on widths below 360, without shrinking the user's text. This adjustment also covers the scan-result action row. TypeScript and the changed-file Expo ESLint check passed after it.

The emulator's Gboard initially used stylus handwriting, exposing only its floating toolbar. Temporarily switching off “Use stylus to write in text fields” established a normal docked keyboard. Purchase amount and note, and the points reason, remain reachable; the action footer moves above the numeric and text keyboards, and the points reason scrolls into view automatically. Screenshots record both layouts. The original handwriting setting was restored to on; `show_ime_with_hard_keyboard=1` is unchanged. English and system font scale 1.0 were restored after the language/large-text checks.

The native camera permission flow and camera preview passed in the emulator. Switching to Number stops the camera; searching for the isolated demo member opens that member. This is not a physical QR/NFC, biometric or push-delivery test.

## Final Android artifact

EAS preview [`d291104f-66d5-4c8b-a8ef-44f850da07ab`](https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/builds/d291104f-66d5-4c8b-a8ef-44f850da07ab) finished at 13:30:02 UTC on 4 November. Runtime source: `e7e5b6cfdcba57d1ababa44710300745e929789f`. Internal Android APK, production Firebase environment, version 1.0.0 (3).

- [Download APK](https://expo.dev/artifacts/eas/q6qTGC-3pNyXF1v76__ZYEqtXvXexUf8t8DOTwuvEOs.apk)
- Local copy: `C:\Users\user6399\Downloads\HexaTech-Staff-Eclipse-Screens.apk`
- Size: 120,315,661 bytes. SHA-256: `2958B22D12EC5A09BA5F58C99D18D350CBAB5F43066D22B6FB316205C57895F2`.
- Installed successfully with `adb install -r`, preserving the existing isolated demo session.

Final APK acceptance: Home loads the same member/request data; the normal member layout is unchanged. At system font scale 2.0 all four member actions are full-width stacked controls with intact labels, including Purchase. The final [large-text capture](screens-android-20261104/member-large.png) records the fix. Font scale 1.0, normal transition animation scale 1.0, English and the original Gboard handwriting preference are restored. Cold launch on this emulator can take several seconds; these checks are not a physical-device performance measurement.

Native screen evidence: [capture index](screens-android-20261104/README.md). Both previews' filtered runtime logs contain no fatal/JavaScript exception matches during the workflow checks. No live points, purchase, check-in or request-transition write was performed; write transition checks used the browser synthetic API.
