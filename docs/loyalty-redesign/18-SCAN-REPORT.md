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

In progress. Local browser fixtures intercept API requests; no production member, balance or scan data is changed during verification. Physical NFC/USB hardware requires an actual compatible reader; browser fixtures validate lifecycle and API behavior.
