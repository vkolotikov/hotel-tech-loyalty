# Members app Figma concept — 11 November 2026

The owner requested a new members-app design in their existing Figma project before implementation, using the supplied Luxury Staff Member Scanner reference and the existing Staff app's minimal dark/glass/background-image style.

## Review links

- [Everyday screens](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8279).
- [Member experience prototype](https://www.figma.com/proto/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8280&starting-point-node-id=440%3A8280).
- [Native Figma behavior/handoff spec](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=460-12607).

File **d6IGmk3hOoMw0V5rONbI1A**, new page **437:8135 — 01G · Members app — Luxury**. Existing platform/member-web pages were preserved. Core overview section **440:8279** contains Home, Member Card, Personal Offers and Events.

## Scope and construction

The first pass delivered **54 editable layouts**, four feedback overlays, reusable components, interactive toggle variants and shared unread-indicator prototype state. Its persisted audit found **376 linked actions**, no missing destinations, no unintended text clipping, no custom-font mismatches and no placeholder labels. The simplification pass below supersedes the original sequence of intermediate screens. Four starting points remain: member experience, joining/sign-in, points-off benefits membership and the iPad study.

Coverage includes card/QR/Wallet, dates/access/programme, benefits/request/cancel, catalogue/redemption confirmation/codes/history, offers/terms/private vouchers/native sharing, enabled event registration/cancellation/attended history, points/stamps/credit, Inbox, Profile/optional birthday, message preferences, referral sharing, language, device lock, Help, registration, password recovery/change and account deletion. States include assigned benefits with points off, scheduled/expired membership, full events, expired offers, offline, empty Inbox and omitted Wallet capability. Appointment/accommodation booking and staff scanner functions are excluded.

Main phone layout is 393 × 852. Adaptive examples cover 320 px, Android Card/Google Wallet and portrait iPad Home/Card with a centred 640 px column. These are layout studies; the main linked journey is the phone experience.

Manrope headings and Inter body/UI text follow available native-app typefaces. SF Pro/Roboto are used only by system references. The example venue uses gold/Manrope; retain the real venue-provided accent/display face during implementation. Text-driven component sizes and fill constraints were fixed at the masters, rather than relying on unsupported instance geometry overrides.

Original source assets were reused without changing their bytes:

- Staff `assets/eclipse/wallpaper-blue-gold.png`, SHA-256 **E0A15CFA738BD4B23EFF788136B042886917ADA9031996187ED0928EEDB0F532**.
- Current members `assets/icon.png`, SHA-256 **2929066F4D50307F9F70E5ABB9B5BAE44E7036D14FFD7B6439AAD377D3292E75**.
- Existing Staff SVG icons, imported as editable vectors. Native status/share components are linked library assets.

No new AI-generated artwork or complete-UI raster was used. The supplied full Staff mockup is a visual reference, not a flattened UI layer. Uploaded raster assets are background/brand content; the screen UI remains editable.

## Validation and implementation boundary

The main composition was visually reviewed. An opacity-binding issue initially hid the wallpaper; opacity-specific colour variables and contrast scrims corrected it. Long/narrow content was checked across all layouts. The demo QR's complex SVG rendered unreliably, so it was replaced with **175 native rectangle runs** matching all **326 dark modules** of the generated 33-row matrix; geometry is in bounds and the QR is visible in the final inspected render.

The QR payload is **HEXA-DESIGN-DEMO-NOT-A-MEMBER**. All member names, balances, contacts, vouchers and availability are illustrative. The prototype performs no real authentication, redemption, registration, account deletion, sharing or Wallet operation. Actual implementation must preserve the existing canonical APIs, capability/eligibility decisions, account boundaries, refresh and duplicate-action safeguards. Native share-sheet choices vary by installed apps/device; use the real OS sheet, not an imitation. All five current app languages remain required; the concept's main copy is English.

Final preview export: `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Concept-20261111.png` (1,149,824 bytes). This is a design presentation, **not a native store screenshot or physical-device QA evidence**. Local construction/evidence helpers are under `C:/wamp64/tmp/member-figma-*`; short-lived upload/screenshot endpoints are private and must never be printed or committed.

This task changed Figma and documentation only. The already delivered 2.1.0 testing binaries (iOS 22, Android 28), runtime source and public-release status are unchanged. No Laravel deployment or new store submission/build was performed.

## Simplification pass — 11 November 2026

The owner requested fewer steps, shorter copy, popups and restrained animation. The existing page and primary frame IDs were updated in place. The original Staff artwork, editable components and central Card destination are retained.

| Journey | Previous | Revised |
| --- | --- | --- |
| Reserve the illustrated free event from Home | Events → details → reserve: 3 taps | Reserve directly: 1 tap |
| Request the welcome drink from Home | Benefits → details → request: 3 taps | Benefits → Request drink: 2 taps |
| Save/share from the Offers list | Offer details → voucher → share: 3 taps | Open voucher → share: 2 taps |
| Share an invitation from More | Invite page → share: 2 taps | Native share reference: 1 tap |
| Save Profile and dismiss feedback | Save → Done: 2 taps | Save: 1 tap; feedback dismisses itself |

Details remain optional. Point spending, event cancellation and account deletion retain explicit confirmations. Direct registration is illustrated only for an eligible free event with one place and no additional form; paid, group, guest or form-based bookings need the appropriate summary/confirmation. The server must still confirm eligibility and capacity.

Bottom navigation is **Home / Rewards / Card / Events / More**. Tapping the balance opens a sheet with Points, Stamps and Credit tabs. Events availability is independent of points. Preferences combines language, message choices and device lock. Language applies immediately; request and registration state updates in context. Vouchers open directly from Offers/Inbox, with optional terms and native sharing. Reward confirmation changes to the code in the same sheet stack; Coffee and Guest pass now populate their own title, cost, code and receipt.

The canvas has **18 bottom-sheet examples**, **seven brief feedback examples** and two native share references. Three superseded full pages (Messages, Referral and Device lock) are hidden references, with **zero incoming prototype links**. The account overview now shows only More, Profile, Preferences and Help. Extra canvas frames represent filters, capability states and adaptive studies, rather than sequential customer steps.

Motion is implemented in the prototype: **240 ms ease-out** bottom entry, **150 ms** local sheet/tab fades and switch feedback, existing **180 ms** main navigation fades. Success feedback closes after **1.6 seconds**, without a Done button. The QR and wallpaper have no looping animation. Actual implementation must respect Reduce Motion with instant changes or a brief opacity fade, announce feedback accessibly, keep feedback nonblocking, and use native keyboard/swipe behavior. Prototype dismissal uses Close/outside tap; drag dismissal is specified for implementation, not simulated.

Final persisted checks cover **62 roots, 59 visible** (including states/references), **301 node-linked actions** and **39 bottom-entry transitions**. No missing destinations, incoming links to hidden references, product-font mismatches, placeholder labels, text encoding errors or unintended text clipping were found. All sheet panels remain in bounds. Empty and populated request/registration states were inspected; fixed viewports fit both. Visual review caught a programme paragraph with a fixed one-line height; text wrapping was corrected after styles settled and the three-line block now measures 57 px. Final core, sheet-state and account compositions were visually reviewed.

Updated presentation exports:

- `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Simplified-20261111.png` — core screens, showing the example reserved state.
- `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Sheets-20261111.png` — compact sheets with requested/registered examples.
- `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Account-20261111.png` — consolidated account overview.

The native Figma spec **460:12607** was edited surgically and read back successfully. Prototype state is reset to the available/unrequested starting state. These remain design examples, not live transactions or native QA. No runtime code, API, build, store listing or Laravel deployment was changed; native tests were not rerun for this design/documentation-only pass.
