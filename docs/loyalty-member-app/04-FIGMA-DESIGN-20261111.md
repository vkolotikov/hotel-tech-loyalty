# Members app Figma concept — 11 November 2026

The owner requested a new members-app design in their existing Figma project before implementation, using the supplied Luxury Staff Member Scanner reference and the existing Staff app's minimal dark/glass/background-image style.

## Review links

- [Everyday screens](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8279).
- [Member experience prototype](https://www.figma.com/proto/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8280&starting-point-node-id=440%3A8280).
- [Native Figma behavior/handoff spec](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=460-12607).

File **d6IGmk3hOoMw0V5rONbI1A**, new page **437:8135 — 01G · Members app — Luxury**. Existing platform/member-web pages were preserved. Core overview section **440:8279** contains Home, Member Card, Personal Offers and Events.

## Scope and construction

**54 editable layouts**, four feedback overlays, reusable components, interactive toggle variants and shared unread-indicator prototype state. The persisted audit found **376 linked actions**, no missing destinations, no unintended text clipping, no custom-font mismatches and no placeholder labels. Four starting points: member experience, joining/sign-in, points-off benefits membership and the iPad study.

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
