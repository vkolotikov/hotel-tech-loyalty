# Loyalty mobile web — 29 October 2026

## Scope and implementation

The phone workspace follows the dedicated Figma mobile compositions at widths up to 767px. It has a 72px organisation header, five fixed destinations (Home, Members, Scan, Requests, More), compact task tiles and summaries, separate member/request detail screens, full-screen member forms and review sheets. Safe-area spacing is included for fixed actions and navigation. Desktop routes and layouts remain available from 768px.

Home prioritises scanning, finding/adding members, waiting requests, two live metrics and the latest activity. First setup shows three decisions and the existing guided setup. More groups the main destinations, settings, help and full admin; its All tools disclosure retains access to secondary tools. Mobile Settings prioritises language, theme, currency and Save/Discard while keeping administration and related links expandable.

Members retains server search/filter/sort/pagination, profile balances and progress, details/NFC/validity, history, benefits and existing management actions. Award/deduction now has a phone review sheet before the existing idempotent writer. Add member uses the existing welcome-email choice and optional validity flow. Requests uses a list followed by a separate detail screen, with authoritative approval/completion gates and explicit confirmation. Referrals remain read-only. The existing mobile scanner and all of its reader integrations use the shared navigation.

## Exact design references

Connected Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `c71f8237-ff98-4a14-8271-a9097c33f93d`. The plugin supplied design context for all 32 mobile screens/sheets. Reference screenshots and browser renders are under `evidence/mobile-web/`.

| Set | Exact nodes |
| --- | --- |
| MH Home, More, first setup | `217:7215`, `217:7216`, `217:7217` |
| MM Members, profile, award, deduct, add, details, benefits | `224:7371`, `224:7440`, `224:7509`, `224:7578`, `224:7647`, `224:7716`, `224:7785` |
| MR Requests, benefit, redemption, referral | `224:7855`, `224:7924`, `224:7993`, `229:8245` |
| MS Scan states | `224:8063`, `224:8132`, `224:8201`, `226:8297`, `229:8354`, `243:8487`, `243:8532` |
| MA Filters, actions, options, manual, reviews, check-in | `228:8095`, `228:8134`, `228:8175`, `228:8221`, `228:8252`, `228:8271`, `228:8290`, `228:8309`, `228:8328`, `228:8347`, `228:8379` |

The 390×844 references define 16px page padding, 12px gaps, 118px task tiles, 104px record cards, 44px minimum controls and an 84px bottom bar. Native SVG geometry is retained: 11 exact existing exports are reused and the one new 20×20 filters icon is vendored locally. SHA-256 provenance is in `assets.json`. Temporary Figma URLs are not runtime dependencies. Visual comparison corrected form/header spacing, sheet padding, stepper dimensions, member validity and summary density.

## Data contracts and intentional adaptations

- All production content comes from the existing bootstrap, Overview, members, rewards, requests and scanner APIs, preserving `brand_id=all`, scope keys, permissions, stale/error states and retry keys. Browser fixtures never become production fallback data.
- The member filter API accepts one level; the phone sheet honours that contract instead of implying unsupported multiple-level filtering.
- There is no staff endpoint for creating a member reward claim. Reward details explain that members claim in their app and link to existing claims; the Figma claim-confirmation sheet is not presented as a working writer. Only active catalogue rewards are shown, without inventing member eligibility. Benefits and member claims use their existing server sources; no claim is inferred by matching benefit names.
- Add member does not invent editable marketing/SMS consent fields. Its consent summary and welcome-email choice follow the current contract.
- The real organisation/staff identity replaces demo text. Existing program rules, dates and balances replace illustrative values. Other sections use their existing responsive layouts through More; the supplied dedicated mobile frame set covers Home, Members, Requests, Scan and sheets.
- English, Russian, German, French and Spanish copy is included. Light theme follows the existing workspace tokens. No backend, schema, dependency or full-admin theme changes.

## Verification and release

Source browser checks: 73 mobile flow assertions, 79 Settings/setup assertions, 34 scanner state assertions and 17 reader-integration assertions passed. The audit covers 30 routes/tabs at desktop and phone widths (60 views), plus 50 narrow/short views across five languages and two themes. API writes are intercepted test fixtures. The scanner fixture now uses an ongoing event instead of an expired calendar date.

The final isolated artifact passed **5,730 frontend tests in 394 files**, **133 Laravel tests / 1,391 assertions**, TypeScript, full Loyalty/shared-footer ESLint and fresh Vite/postbuild. The Laravel directory/filter is recorded in `evidence/mobile-web/verification.json`; it checks the actual Overview, members/membership, points, requests, rewards, currency, setup, scan/access and validity contracts.

Compiled Chrome repeated all **203 interaction assertions**, the **60 section views** and **70 narrow/short views** (320×568, five languages, two themes, including full-screen award and confirmation). A separate touch/device-scale emulation confirmed the 390px viewport meta, tap navigation and program-summary dialog. No runtime errors or horizontal overflow were found. QR decoding ran against a MediaStream using the real ZXing decoder; NFC/USB transport events were simulated. These are browser/device-emulation checks, not physical-phone or physical-reader certification.

Final geometry at 390×844: header 390×72, navigation 390×84 at y=760, tiles 173×118, summary cards 173×126 at y=448 and latest activity 358×142 at y=586. More buttons are 326×44 at x=32, starting y=167. Rendered Home, More, members/forms/details, requests and scan states were compared with the exact Figma references. `geometry.json` records computed fonts and bounds.

Production commit **16788ad8cad9ecf0886c28c2ecd0997f40a725d9** was pushed from the isolated deploy branch. Production parent is `ce1f55e0f`; final source patch is `60916b106`. Deployment follows `docs/landing-page-builder.md` §6 from previous source baseline `43382945207c44ae6a6ce952272121e32e6a1d10`. Selected and whole-source parity passed across **240 explicitly allowed paths**, including previous release documentation. Feature branch: `feature/loyalty-mobile-20261029`. Deployed source and **next source-patch baseline: `e4f43246f5ec0195cbb36c50c861afe744437790`**. Later documentation/evidence commits are not that baseline. Feature build outputs were not committed or shipped.

Live content verified **29 October, 12:22 Europe/Riga**. Entry `index-wkLcRp-m.js`, Loyalty `LoyaltyApp-DA0ULxos.js` / `LoyaltyApp-Ddu--NOf.css`. New mobile and existing Settings/setup/Insights/Campaigns/Scan/Requests/Card markers, mobile safe-area styles, three Poppins payloads and five protected API responses passed. The public landing kit retained its stylesheet without retired `rp-` markers, and the retired stylesheet returned 404. Exact result: `evidence/mobile-web/live-verification.json`.

Temporary artifact and preview were removed after verification. Original Vite PID 1992 and unrelated user files remain. Private reproducibility helpers/logs are `E:/Hexa-Tech-release/mobile-*` and `logs/mobile-*`; the checked-in mobile browser assertions and existing section fixtures are under `frontend/e2e/`.
