# Scan a member — Figma implementation

Scope: the normal `/loyalty/scan` workspace. The continuous `/loyalty/scan/door` route remains available. Existing camera decoding, Web NFC, USB/WebHID, keyboard readers, NFC linking, membership renewal, visits, purchases, credit, requests and point writers remain authoritative.

## Design reference

Connected Figma file `d6IGmk3hOoMw0V5rONbI1A`, inspected with metadata, design context and full-resolution screenshots on 2026-10-28:

| Frames | Nodes | Implementation |
| --- | --- | --- |
| SC-01, SC-02, SC-03 | 158:7303, 158:7304, 158:7305 | Idle scanner, member actions, access result |
| SC-01a, SC-01b | 167:7665, 167:7666 | Reader/context options and manual lookup |
| MS-01–MS-03 | 224:8063, 224:8132, 224:8201 | Mobile NFC start, member tiles, access result |
| MS-04–MS-05 | 226:8297, 229:8354 | Camera permission failure and live preview |
| MS-06–MS-07 | 243:8487, 243:8532 | NFC listening and unavailable states |

Original exported SVGs are in `frontend/src/loyalty/scan/design/assets`; matching existing overview icons are reused. Reference and rendered screenshots are in `evidence/scan`. Existing Poppins, theme tokens, buttons, accessible dialogs and the points editor are reused.

## Integration and deliberate differences

- Reader activation requires a user gesture. The normal scanner pauses after one result. NFC aborts on pause, manual lookup, context change and navigation; the camera releases its controls on stop/unmount. The continuous door scanner retains its established behavior.
- Manual search uses the existing organisation-scoped `find` endpoint. Opening a desk result is read-only. A door result explicitly checks access; an event result explicitly records event attendance through the existing scan endpoint. Every loyalty request retains `brand_id=all`.
- Scan writes keep the captured context and idempotency key, including retry after an unanswered request. A synchronous in-flight guard prevents overlapping normal scans.
- Member details and options use organisation/staff-scoped query keys. Server permissions, balances, benefits, membership status and access decisions drive the screen. Failed member detail loads disable actions; forbidden detail responses remove the identity. No Figma example points are prefilled.
- There is no separate entrance entity: the existing Place selector is used. Events remain selectable, with their attendance/points effects explained before scanning. Place access checks do not claim to award visit points or physically open doors.
- Existing visit/purchase and credit actions remain available under Check-in. The point form is shared with the member page; its validation and existing writer remain unchanged.
- Mobile navigation preserves account, language, theme, search, shortcuts and other routes through More. EN/RU/DE/FR/ES and both themes are supported.

## Verification

Local browser fixtures intercept API requests; no production member, balance or scan data is changed during verification. The source-browser runs pass 34 interaction/state checks and 17 reader/integration checks, including actual ZXing decoding of a fixture QR carried in a MediaStream, camera track shutdown, NFC abort, simulated USB HID parsing/close, unanswered retry key reuse, event attendance, pending-write locking, failed searches, forbidden member detail, five locales and both themes.

The isolated artifact passed **1,138 PHP tests / 12,015 assertions** across LoyaltyWorkspace (591), Loyalty (382), AdminAccess (51), Unit/Loyalty (90), Admin scan (13) and NFC link (11). PHP 8.4.20 was used in scoped foreground runs; no server source, schema, dependency or API contract changed.

The full frontend run caught four unregistered fallback keys. These were corrected to the existing membership, Overview-help and Today-here keys. The final deployment checkout passes **5,688 frontend tests in 393 files**, TypeScript and the Loyalty ESLint check. Focused scanner/member tests cover permission gating, expired membership labels, inactive hardware and locale completeness.

Visual comparison: desktop scanner width 880px, preview height 480px, 248×44px start button; mobile bottom navigation 390×84px at y=760 in the 390×844 frame, action tiles 173×118px. Desktop points input is 30px, using the shared validated editor. All three local Poppins weights load. Rendered references are reviewed against the exact Figma desktop/member/access and mobile states. Small text/height differences reflect actual state, translated server dates and the existing shell utilities. No example/demo facts are shown as live data.

Physical NFC/USB hardware still requires an actual compatible reader; fixtures verify browser lifecycle and API behavior. A real camera image was replaced only inside the local browser test with a generated QR video stream.

Storage incident: C: reported ENOSPC during the final locale commit. No files were deleted. Work continued in a complete independent clone at `E:/Hexa-Tech-release/scan-source`, with a fresh deployment worktree at `E:/Hexa-Tech-release/scan-final`, preserving the original C: workspace and its untracked files.
