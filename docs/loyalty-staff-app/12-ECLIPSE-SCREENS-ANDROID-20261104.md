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
- Web SecureStore is unavailable for the durable desk journal: the preview correctly prevents points/purchase writes and displays its storage error. Native desk-form validation and keyboard acceptance must be checked in the Android binary. Browser checks are not native sensor, biometric or push-delivery acceptance.

Android build and installed-device evidence will be appended after completion.
